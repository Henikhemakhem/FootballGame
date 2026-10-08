export function priceFor(player) {
  if (Number.isInteger(player.demoPrice) && player.demoPrice >= 15 && player.demoPrice <= 75) {
    return player.demoPrice;
  }
  // Prix fictif stable : même identifiant, même prix, sans lien avec la valeur sportive.
  const hash = [...String(player.id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  return 15 + (hash % 13) * 5;
}
