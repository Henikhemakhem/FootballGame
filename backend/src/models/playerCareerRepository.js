export class PlayerCareerRepository {
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
    this.db.prepare(`INSERT INTO PlayerCareerGame
      (id, playerId, playerName, playerPhoto, career, dataNote, status, difficulty, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'PLAYING', ?, ?)`).run(
      game.id, game.playerId, game.playerName, game.playerPhoto,
      JSON.stringify(game.career), game.dataNote, game.difficulty, game.createdAt,
    );
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM PlayerCareerGame WHERE id = ?').get(id);
    return row ? { ...row, career: JSON.parse(row.career) } : null;
  }

  answer(id, answer, correct, answeredAt) {
    return this.db.prepare(`UPDATE PlayerCareerGame SET status='FINISHED', answer=?,
      isCorrect=?, answeredAt=? WHERE id=? AND status='PLAYING'`).run(answer, Number(correct), answeredAt, id).changes;
  }
}
