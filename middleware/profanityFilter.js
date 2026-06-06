const badWords = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'bastard', 'crap',
  'dick', 'piss', 'slut', 'whore', 'cock', 'cunt', 'motherfucker',
];

function profanityFilter(text) {
  let cleaned = text;
  for (const word of badWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '*'.repeat(word.length));
  }
  return cleaned;
}

module.exports = profanityFilter;
