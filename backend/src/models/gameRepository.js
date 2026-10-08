export class GameRepository {
  constructor(db) { this.db = db; }

  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  create(game) {
    this.db.prepare(`INSERT INTO Game
      (id, player1Name, player2Name, player1Money, player2Money, currentTurn,
       currentPlayer, status, createdAt, version, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      game.id, game.player1Name, game.player2Name, game.player1Money, game.player2Money,
      game.currentTurn, game.currentPlayer, game.status, game.createdAt, game.version,
      JSON.stringify(game.state),
    );
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM Game WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, state: JSON.parse(row.state), teams: {
      1: this.team(id, 1), 2: this.team(id, 2),
    } };
  }

  team(id, owner) {
    return this.db.prepare('SELECT * FROM GamePlayer WHERE gameId = ? AND owner = ? ORDER BY id').all(id, owner).map(row => ({ ...row }));
  }

  save(game) {
    this.db.prepare(`UPDATE Game SET player1Money=?, player2Money=?, currentTurn=?,
      currentPlayer=?, status=?, version=?, state=? WHERE id=?`).run(
      game.player1Money, game.player2Money, game.currentTurn, game.currentPlayer,
      game.status, game.version, JSON.stringify(game.state), game.id,
    );
  }

  purchase(gameId, player, owner) {
    this.db.prepare(`INSERT INTO GamePlayer
      (gameId, footballPlayerId, name, photo, team, nationality, position, price, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      gameId, String(player.id), player.name, player.photo, player.team,
      player.nationality, player.position, player.price, owner,
    );
  }
}
