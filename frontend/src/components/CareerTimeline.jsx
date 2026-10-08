import { Building2 } from 'lucide-react';

export function CareerTimeline({ career }) {
  return <ol className="career-timeline" aria-label="Parcours professionnel, dans l’ordre chronologique">
    {career.map((step, index) => <li key={index}>
      <span className="timeline-marker" aria-hidden="true"><Building2 size={18} /></span>
      <div>{step.season && <span className="timeline-period">{step.season}</span>}<strong>{step.club}</strong></div>
      <span className="timeline-order" aria-label={'Étape ' + (index + 1)}>{String(index + 1).padStart(2, '0')}</span>
    </li>)}
  </ol>;
}

export const difficulties = [
  { id: 'easy', name: 'Facile', description: 'Clubs et dates disponibles' },
  { id: 'medium', name: 'Moyen', description: 'Clubs et périodes par année' },
  { id: 'hard', name: 'Difficile', description: 'Les clubs, sans les dates' },
];

export function DifficultyPicker({ value, onChange, disabled }) {
  return <fieldset className="difficulty-picker"><legend>Choisissez la difficulté</legend><div>
    {difficulties.map(option => <label key={option.id} className={value === option.id ? 'selected' : ''}>
      <input type="radio" name="difficulty" value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} disabled={disabled} />
      <strong>{option.name}</strong><span>{option.description}</span>
    </label>)}
  </div></fieldset>;
}
