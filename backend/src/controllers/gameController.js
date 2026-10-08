export function gameController(service) {
  return {
    create: async (req, res) => res.status(201).json(await service.create(req.body)),
    get: (req, res) => res.json(service.get(req.params.id)),
    auction: (req, res) => res.json(service.auction(req.params.id)),
    team: (req, res) => res.json(service.team(req.params.id, req.params.player)),
    bid: (req, res) => res.json(service.bid(req.params.id, req.body)),
    pass: (req, res) => res.json(service.pass(req.params.id, req.body)),
  };
}
