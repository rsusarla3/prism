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
  const [mistakes, setMistakes] = useState(0);
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

  else if (step === 1) stage = <article className="question-card core-story watch-stage">{loading ? <Skeleton /> : error ? <ErrorState message={error} /> : data ? <><span className="step-label">Watch the race</span><h2>Rabbit starts slow—then zooms.</h2><RaceTrack data={data} /><div className="hop-cards">{data.points.slice(0, 7).map((point, i) => <div key={point.year} style={{ '--hop': i } as React.CSSProperties}><small>Hop {i}</small><span><i>🐢</i>{point.linear}</span><span><i>🐇</i>{point.exponential}</span></div>)}</div><div className="kid-insight"><span>✨</span><p>Turtle always gets <b>10 more</b>.<br />Rabbit doubles the <b>whole pile</b>.</p></div></> : null}<CoreNav step={step} go={go} /></article>;

  else if (step === 2) stage = <article className="question-card core-story"><span className="step-label">Name the magic</span><h2>Which row belongs to Rabbit?</h2><div className="character-rule"><div><span>🐢</span><p><b>Linear</b> means add the same amount.</p></div><div><span>🐇</span><p><b>Exponential</b> means multiply the whole amount.</p></div></div><div className="answer-list">{[['wrong', '10 → 20 → 30 → 40'], ['right', '10 → 20 → 40 → 80'], ['wrong', '10 → 15 → 20 → 25']].map(([kind, text]) => <button key={text} onClick={() => { if (kind === 'right') setFeedback('Yes! Rabbit doubles the whole pile.'); else { setMistakes(x => x + 1); setFeedback('That one belongs to Turtle. It adds the same amount.'); } }}>{text}<span>→</span></button>)}</div>{feedback && <div className={feedback.startsWith('Yes') ? 'feedback success' : 'feedback'}><span>{feedback.startsWith('Yes') ? '✓' : '🐢'}</span><p>{feedback}</p></div>}{mistakes >= 2 && <div className="mode-switch"><span>Rabbit’s clue</span><h3>Can you say “times 2” between every number?</h3><p>If yes, Rabbit made it.</p></div>}<CoreNav step={step} go={go} nextDisabled={!feedback.startsWith('Yes')} /></article>;

  else stage = <article className="question-card core-story"><span className="step-label">Use your new power</span><h2>Who grows each garden?</h2><div className="garden-story"><div><span>🐢</span><b>Garden A</b><p>Plant 4 new flowers every week.</p></div><div><span>🐇</span><b>Garden B</b><p>Every flower makes 2 new flowers.</p></div></div><div className="answer-list"><button onClick={() => setFeedback('Yes! A adds 4. B multiplies by 2.')}>A is linear · B is exponential <span>→</span></button><button onClick={() => setFeedback('Look for Turtle’s “add” and Rabbit’s “multiply.”')}>Both grow the same way <span>→</span></button></div>{feedback && <div className={feedback.startsWith('Yes') ? 'feedback success' : 'feedback'}><span>{feedback.startsWith('Yes') ? '🏆' : '↗'}</span><p>{feedback}</p></div>}<CoreNav step={step} go={go} /></article>;

  return <section className="lesson core-kids page-enter"><CurriculumMap product="core" /><header className="lesson-head"><div><p className="kicker coral">Open now · Linear & exponential graphs</p><h1 ref={heading} tabIndex={-1}>Turtle or Rabbit?</h1><p>Add the same piece—or grow the whole pile.</p></div><Stepper step={step} labels={['Guess', 'Watch', 'Name it', 'Use it']} onStep={go} /></header><div className="stage" key={step}>{stage}</div></section>;
}

function CoreNav({ step, go, nextDisabled = false }: { step: number; go: (step: number) => void; nextDisabled?: boolean }) {
  return <nav className="core-nav" aria-label="Lesson navigation"><button className="secondary" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>{step < 3 ? <button className="primary" disabled={nextDisabled} onClick={() => go(step + 1)}>Next <span>→</span></button> : <button className="primary" onClick={() => go(0)}>Race again <span>↻</span></button>}</nav>;
}

function RaceTrack({ data }: { data: GrowthResult }) {
  const turtle = data.points[data.points.length - 1]?.linear || 1;
  const rabbit = data.points[data.points.length - 1]?.exponential || 1;
  const max = Math.max(turtle, rabbit);
  return <div className="race-track" role="img" aria-label={`After six hops, Turtle has ${turtle} points and Rabbit has ${rabbit} points`}><div className="finish">🏁</div><div className="lane turtle-lane" style={{ '--distance': `${Math.max(14, turtle / max * 72)}%` } as React.CSSProperties}><span>🐢</span><i /><b>{turtle}</b></div><div className="lane rabbit-lane" style={{ '--distance': `${Math.max(14, rabbit / max * 72)}%` } as React.CSSProperties}><span>🐇</span><i /><b>{rabbit}</b></div></div>;
}
