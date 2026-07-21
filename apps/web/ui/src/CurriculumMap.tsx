type Unit = { title: string; concept: string; available?: boolean };

const algebra: Unit[] = [
  { title: 'Expressions', concept: 'Patterns & equivalent forms' },
  { title: 'Equations', concept: 'Solve & explain' },
  { title: 'Inequalities', concept: 'Compare possible values' },
  { title: 'Functions & Graphs', concept: 'Linear & exponential graphs', available: true },
  { title: 'Systems', concept: 'Two equations together' },
  { title: 'Polynomials', concept: 'Combine & factor' },
  { title: 'Quadratics', concept: 'Curves & roots' },
];

const finance: Unit[] = [
  { title: 'Earning', concept: 'Income, benefits & taxes' },
  { title: 'Spending', concept: 'Budgets & everyday choices' },
  { title: 'Saving', concept: 'Goals & emergency funds' },
  { title: 'Investing', concept: 'Compound interest', available: true },
  { title: 'Credit', concept: 'Cards, scores & borrowing' },
  { title: 'Risk', concept: 'Insurance, scams & protection' },
];

export default function CurriculumMap({ product }: { product: 'core' | 'future' }) {
  const units = product === 'core' ? algebra : finance;
  return <section className={`curriculum-map ${product}`} aria-label={`${product === 'core' ? 'Algebra' : 'Personal finance'} learning map`}>
    <div className="curriculum-title"><span>{product === 'core' ? 'Algebra' : 'Personal Finance'}</span><b>1 concept available</b></div>
    <div className="curriculum-units">{units.map((unit, index) => <button key={unit.title} className={unit.available ? 'available' : 'locked'} disabled={!unit.available} aria-label={`${unit.title}: ${unit.concept}${unit.available ? ', available now' : ', coming soon'}`}><i>{unit.available ? '●' : '○'}</i><span><b>{unit.title}</b><small>{unit.concept}</small></span><em>{unit.available ? 'Open' : 'Soon'}</em></button>)}</div>
  </section>;
}
