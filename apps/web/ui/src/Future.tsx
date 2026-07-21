import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Count, ErrorState, Range, Skeleton, Stepper } from './components';
import { FutureChart } from './Charts';
import CurriculumMap from './CurriculumMap';
import type { Content, InvestResult } from './types';

const defaults = { startingBalance: 1000, monthlyContribution: 200, years: 35, assumedReturnPct: 7, feePct: .2, inflationPct: 2.5 };

export default function Future() {
  const [step, setStep] = useState(0);
  const [content, setContent] = useState<Content | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [profile, setProfile] = useState(defaults);
  const [data, setData] = useState<InvestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlays, setOverlays] = useState(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { api.content().then(setContent).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => api.invest(profile).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)), 120);
    return () => clearTimeout(timer);
  }, [profile]);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const choose = (label: string) => setGoals(old => old.includes(label) ? old.filter(x => x !== label) : old.length < 5 ? [...old, label] : old);
  const addCustom = () => {
    const value = custom.trim();
    if (value && goals.length < 5 && !goals.includes(value)) { setGoals([...goals, value]); setCustom(''); }
  };
  const toggle = (name: string) => setOverlays(old => {
    const next = new Set(old); next.has(name) ? next.delete(name) : next.add(name); return next;
  });

  return <section className={`lesson future page-enter ${step === 0 ? 'future-imagine' : ''}`}><CurriculumMap product="future" />
    {step > 0 && <header className="lesson-head"><div><p className="kicker mint">Open now · Investing · Compound interest</p><h1 ref={heading} tabIndex={-1}>Build what matters.</h1></div><Stepper step={step} labels={['Imagine', 'Model', 'Learn', 'See it']} /></header>}
    {error && <ErrorState message={error} />}
    <div className="stage" key={step}>
      {step === 0 ? <GoalCanvas content={content} goals={goals} custom={custom} setCustom={setCustom} choose={choose} addCustom={addCustom} next={() => setStep(1)} heading={heading} />
        : step === 1 ? <div className="future-model">
          <aside className="control-card"><span className="step-label">Try your numbers</span><h2>Shape the future</h2>
            <Range label="Starting amount" value={profile.startingBalance} min={0} max={50000} step={1000} onChange={n => setProfile({ ...profile, startingBalance: n })} />
            <Range label="Each month" value={profile.monthlyContribution} min={0} max={2000} step={100} onChange={n => setProfile({ ...profile, monthlyContribution: n })} />
            <Range label="Years" value={profile.years} min={5} max={50} step={5} onChange={n => setProfile({ ...profile, years: n })} />
            <Range label="Possible growth" value={profile.assumedReturnPct} min={1} max={12} step={1} suffix="%" onChange={n => setProfile({ ...profile, assumedReturnPct: n })} />
            <button className="primary" onClick={() => setStep(2)}>What could I invest in? <span>→</span></button>
          </aside>
          <article className="chart-card">{loading || !data ? <Skeleton /> : <>
            <div className="chart-title"><div><span className="step-label">Possible balance</span><h2><Count value={data.projection.balance} /></h2></div><span className="live-dot">Live</span></div>
            <div className="scenario-toggles"><button aria-pressed={overlays.has('later')} onClick={() => toggle('later')}>Wait 5 years</button></div>
            <FutureChart baseline={data.projection.series} startLater={data.comparisons.startLater.series} higherFee={data.comparisons.higherFee.series} overlays={overlays} />
            <div className="metric-grid"><div><small>You put in</small><b><Count value={data.projection.contributed} /></b></div><div><small>Possible growth</small><b><Count value={data.projection.growth} /></b></div><div><small>In today’s dollars</small><b><Count value={data.projection.inflationAdjustedBalance} /></b></div></div>
            <p className="disclaimer">Example only. Markets can rise or fall.</p>
          </>}</article>
        </div>
        : step === 2 ? <article className="asset-stage"><span className="step-label">Three building blocks</span><h2>Own. Bundle. Lend.</h2><div className="asset-grid">{content?.assetClasses.map((a, i) => <article key={a.id}><span>0{i + 1}</span><h3>{shortAssetTitle(a.id)}</h3><p>{shortAssetCopy(a.id)}</p></article>)}</div><div className="insight"><span>◇</span><p><b>Account = box.</b> Investments go inside it.</p></div><button className="primary" onClick={() => setStep(3)}>See my future <span>→</span></button></article>
        : <FutureSnapshot goals={goals} data={data} />}
    </div>
  </section>;
}

function GoalCanvas({ content, goals, custom, setCustom, choose, addCustom, next, heading }: { content: Content | null; goals: string[]; custom: string; setCustom: (value: string) => void; choose: (label: string) => void; addCustom: () => void; next: () => void; heading: React.RefObject<HTMLHeadingElement | null> }) {
  return <article className="goal-stage"><div className="goal-orb orb-one" /><div className="goal-orb orb-two" /><div className="goal-heading"><div><span className="step-label">Pick 3–5</span><h1 ref={heading} tabIndex={-1}>What should money make possible?</h1></div><span className={`goal-count ${goals.length >= 3 ? 'ready' : ''}`} aria-live="polite">{goals.length}<small>/5</small></span></div>
    {!content ? <Skeleton /> : <div className="goal-wall">{content.futureGoals.map((g, i) => <button style={{ '--i': i } as React.CSSProperties} data-category={g.category} aria-pressed={goals.includes(g.label)} className={goals.includes(g.label) ? 'selected' : ''} onClick={() => choose(g.label)} key={g.id}><span>{goalIcon(g.category)}</span><b>{g.label}</b><i>{goals.includes(g.label) ? '✓' : '+'}</i></button>)}</div>}
    <div className="goal-dock"><div className="custom-goal"><input aria-label="Add your own future goal" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} placeholder="Add your own…" maxLength={36} /><button onClick={addCustom} aria-label="Add custom goal">+</button></div><div className="goal-progress" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i className={i < goals.length ? 'filled' : ''} key={i} />)}</div><button className="primary goal-continue" disabled={goals.length < 3} onClick={next}>{goals.length < 3 ? `${3 - goals.length} more` : 'Make it real'} <span>→</span></button></div>
  </article>;
}

function FutureSnapshot({ goals, data }: { goals: string[]; data: InvestResult | null }) {
  const featured = goals.slice(0, 2).map(sceneForGoal);
  return <article className="snapshot-stage snapshot-local"><div className="snapshot-visual snapshot-pair">{featured.map((scene, i) => <figure key={`${scene.src}-${i}`}><img src={scene.src} alt={scene.alt} /><figcaption>{goals[i]}</figcaption></figure>)}<div className="snapshot-overlay"><span>Two goals · one future</span><strong>{goals.slice(0, 2).join(' + ')}</strong></div><span className="snapshot-badge">Your Future Snapshot</span></div><div className="snapshot-copy"><span className="step-label">Built from your choices</span><h2>Picture both.</h2><p>Long-term choices can support more than one part of the life you want.</p>{data && <div className="metric-feature"><small>Possible monthly retirement spending · today’s dollars</small><b><Count value={data.projection.estimatedMonthlyIncome} /></b><span>rough 4% learning example—not a promise</span></div>}<div className="snapshot-goals">{goals.map(g => <span key={g}>{g}</span>)}</div><button className="primary" onClick={() => window.print()}>Save this vision <span>↓</span></button></div></article>;
}

function sceneForGoal(goal: string) {
  const text = goal.toLowerCase();
  if (/active|healthy|healthcare|outdoor/.test(text)) return { src: '/public/future-scenes/health-active.png', alt: 'An active older adult walking beside a community garden' };
  if (/volunteer|community|purpose/.test(text)) return { src: '/public/future-scenes/community-purpose.png', alt: 'Neighbors volunteering together in a community garden' };
  if (/hobb|art|learning/.test(text)) return { src: '/public/future-scenes/hobbies-learning.png', alt: 'An older adult enjoying art and lifelong learning' };
  if (/family|friend|grand|loved|legacy|home/.test(text)) return { src: '/public/future-scenes/family-security.png', alt: 'A family sharing a calm morning in a comfortable home' };
  if (/business|work|independence/.test(text)) return { src: '/public/future-scenes/career-creative.png', alt: 'A young adult opening a neighborhood creative studio' };
  if (/travel|move/.test(text)) return { src: '/public/future-scenes/travel-freedom.png', alt: 'A young adult enjoying a calm morning in a coastal town' };
  return { src: '/public/future-scenes/family-security.png', alt: 'A calm, secure morning at home' };
}

function shortAssetTitle(id: string) { return ({ stock: 'Stock', etf: 'ETF', bond: 'Bond' } as Record<string, string>)[id] || id; }
function shortAssetCopy(id: string) { return ({ stock: 'A small piece of one company. Bigger swings.', etf: 'A basket of investments. Built-in variety.', bond: 'You lend money. Usually steadier.' } as Record<string, string>)[id] || ''; }
function goalIcon(category: string) { return ({ security: '◒', freedom: '↗', lifestyle: '✦', family: '◎', achievement: '◇' } as Record<string, string>)[category] || '◇'; }
