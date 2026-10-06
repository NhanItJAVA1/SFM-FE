const lightCategoryColors = [
  '#eaf7ff',
  '#ecfdf3',
  '#fff4de',
  '#f4efff',
  '#ffeef4',
  '#edf7f2',
  '#fff1e8',
  '#edf2ff',
  '#f1f8e9',
  '#fef0ef',
];

const lightCategoryBorderColors = [
  '#b7e4ff',
  '#b8efcc',
  '#ffdca3',
  '#d8c9ff',
  '#ffc7d9',
  '#bde4d1',
  '#ffcdb0',
  '#c5d3ff',
  '#cfe7b3',
  '#ffc3bf',
];

function hashCategoryKey(key: string) {
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getLightCategoryColor(key: string | number) {
  const colorIndex = hashCategoryKey(String(key)) % lightCategoryColors.length;

  return {
    backgroundColor: lightCategoryColors[colorIndex],
    borderColor: lightCategoryBorderColors[colorIndex],
  };
}
