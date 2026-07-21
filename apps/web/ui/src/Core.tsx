import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ErrorState, Skeleton, Stepper } from './components';
import CurriculumMap from './CurriculumMap';
import type { GrowthResult } from './types';

const defaults = { start: 10, linearIncrement: 10, exponentialMultiplier: 2, years: 6 };

export default function Core() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GrowthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guess, setGuess] = useState<'linear' | 'exponential' | null>(null);
  const [feedback, setFeedback] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setLoading(true);
    api.growth({ ...defaults, guess: guess || undefined }).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [guess]);
  useEffect(() => { heading.current?.focus(); setFeedback(''); }, [step]);

  const go = (next: number) => setStep(Math.max(0, Math.min(3, next)));
  let stage;

  if (step === 0) stage = <article className="question-card core-story"><span className="step-label">Meet the racers</span><h2>Turtle adds. Rabbit doubles.</h2><div className="animal-pick"><button className={guess === 'linear' ? 'selected' : ''} onClick={() => setGuess('linear')}><span className="animal">🐢</span><b>Turtle</b><strong>+10</strong><small>each hop</small></button><button className={guess === 'exponential' ? 'selected' : ''} onClick={() => setGuess('exponential')}><span className="animal">🐇</span><b>Rabbit</b><strong>×2</strong><small>each hop</small></button></div><p className="core-prompt">They start with 10 points. Who has more after 6 hops?</p>{guess && <div className="feedback success"><span>★</span><p>Great guess. Let’s watch!</p></div>}<CoreNav step={step} go={go} nextDisabled={!guess || loading} /> </article>;

  else if (step === 1) stage = <article className="question-card core-story watch-stage">{loading ? <Skeleton /> : error ? <ErrorState message={error} /> : data ? <><span className="step-label">Watch the graph</span><h2>Same start. Very different paths.</h2><AnimalGrowthGraph data={data} /><div className="kid-insight"><span>🐢</span><p><b>Linear:</b> equal steps make a straight line.</p><span>🐇</span><p><b>Exponential:</b> growing hops make a curve.</p></div></> : null}<CoreNav step={step} go={go} /></article>;

  else if (step === 2) stage = <article className="question-card core-story"><span className="step-label">Name the patterns</span><h2>Follow each animal’s rule.</h2><div className="pattern-sides"><section className="turtle-side"><span className="big-animal">🐢</span><h3>Linear</h3><p>Add the same amount every step.</p><div className="number-path"><b>10</b><i>+10</i><b>20</b><i>+10</i><b>30</b><i>+10</i><b>40</b></div><code>10 + 10 × step</code></section><section className="rabbit-side"><span className="big-animal">🐇</span><h3>Exponential</h3><p>Multiply the whole amount every step.</p><div className="number-path"><b>10</b><i>×2</i><b>20</b><i>×2</i><b>40</b><i>×2</i><b>80</b></div><code>10 × 2<sup>step</sup></code></section></div><CoreNav step={step} go={go} /></article>;

  else stage = <article className="question-card core-story"><span className="step-label">A new example</span><h2>Saving coins vs. sharing a video</h2><div className="real-example"><section><span>🐢 🪙</span><h3>Save 5 coins each week</h3><div className="mini-sequence">10 → 15 → 20 → 25</div><code>coins = 10 + 5 × weeks</code><b>Linear: add 5</b></section><section><span>🐇 📱</span><h3>Each viewer shares with 2 people</h3><div className="mini-sequence">10 → 20 → 40 → 80</div><code>views = 10 × 2<sup>hours</sup></code><b>Exponential: multiply by 2</b></section></div><p className="core-finish">Straight line = same-size steps. Curve = steps that keep getting bigger.</p><CoreNav step={step} go={go} /></article>;

  return <section className="lesson core-kids page-enter"><CurriculumMap product="core" /><header className="lesson-head"><div><p className="kicker coral">Open now · Linear & exponential graphs</p><h1 ref={heading} tabIndex={-1}>Turtle or Rabbit?</h1><p>Add the same piece—or grow the whole pile.</p></div><Stepper step={step} labels={['Guess', 'Watch', 'Name it', 'Use it']} onStep={go} /></header><div className="stage" key={step}>{stage}</div></section>;
}

function CoreNav({ step, go, nextDisabled = false }: { step: number; go: (step: number) => void; nextDisabled?: boolean }) {
  return <nav className="core-nav" aria-label="Lesson navigation"><button className="secondary" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>{step < 3 ? <button className="primary" disabled={nextDisabled} onClick={() => go(step + 1)}>Next <span>→</span></button> : <button className="primary" onClick={() => go(0)}>Race again <span>↻</span></button>}</nav>;
}

function AnimalGrowthGraph({ data }: { data: GrowthResult }) {
  const W = 760, H = 390, P = 55;
  const max = Math.max(...data.points.flatMap(p => [p.linear, p.exponential]));
  const xy = (year: number, value: number) => [P + year / 6 * (W - P * 2), H - P - value / max * (H - P * 2)];
  const line = (key: 'linear' | 'exponential') => data.points.map(p => xy(p.year, p[key]).join(',')).join(' ');
  return <div className="animal-graph"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Animated graph comparing Turtle's linear steps with Rabbit's exponential hops"><defs><linearGradient id="kidGraph" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--mint)" stopOpacity=".22" /><stop offset="1" stopColor="var(--mint)" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3, 4, 5, 6].map(n => <line key={n} x1={xy(n, 0)[0]} x2={xy(n, 0)[0]} y1={35} y2={H - P} className="kid-grid" />)}<line x1={P} x2={W-P} y1={H-P} y2={H-P} className="kid-axis" /><polyline className="animal-line turtle-line" points={line('linear')} /><polyline className="animal-line rabbit-line" points={line('exponential')} />{data.points.map((p, i) => { const [tx, ty] = xy(p.year, p.linear); const [rx, ry] = xy(p.year, p.exponential); return <g key={i}><text className="graph-animal turtle-dot" style={{ '--delay': `${i * .22}s` } as React.CSSProperties} x={tx} y={ty - 9}>🐢</text><text className="graph-animal rabbit-dot" style={{ '--delay': `${i * .22 + .1}s` } as React.CSSProperties} x={rx} y={ry - 9}>🐇</text><text className="hop-label" x={tx} y={H - 22} textAnchor="middle">{i}</text></g>})}<text x={W/2} y={H-2} textAnchor="middle" className="hop-label">HOPS</text></svg><div className="animal-legend"><span><i className="turtle-swatch" />🐢 Linear · +10</span><span><i className="rabbit-swatch" />🐇 Exponential · ×2</span></div></div>;
}
