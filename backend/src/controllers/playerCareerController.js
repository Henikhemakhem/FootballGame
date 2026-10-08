export function playerCareerController(service) {
  return {
    start: async (req, res) => res.status(201).json(await service.start(req.body)),
    get: (req, res) => res.json(service.get(req.params.gameId)),
    answer: (req, res) => res.json(service.answer(req.params.gameId, req.body)),
  };
}
