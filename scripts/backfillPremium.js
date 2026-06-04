require('dotenv/config');
const mongoose = require('mongoose');
const Confession = require('../models/Confession');
const User = require('../models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const premiumUsers = await User.find({ premium: true }, { username: 1 }).lean();
  const usernames = premiumUsers.map((u) => u.username);
  console.log(`Found ${usernames.length} premium users`);

  if (usernames.length === 0) {
    console.log('No premium users found');
    await mongoose.disconnect();
    return;
  }

  const result = await Confession.updateMany(
    { userId: { $in: usernames }, isPremium: { $ne: true } },
    { $set: { isPremium: true } },
  );
  console.log(`Updated ${result.modifiedCount} confessions with isPremium=true`);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => { console.error(err); process.exit(1); });
