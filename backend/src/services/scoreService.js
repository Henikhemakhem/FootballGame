export function scoreTeam(team) {
  return team.reduce((score, player) => score + player.price, 0);
}

export function gameResult(teams) {
  const scores = { 1: scoreTeam(teams[1]), 2: scoreTeam(teams[2]) };
  return { scores, winner: scores[1] === scores[2] ? null : scores[1] > scores[2] ? 1 : 2 };
}
