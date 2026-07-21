import { useEffect, useState } from 'react';
import type { CapturedSource, LearningAsset, LearningAssetKind, StudyBundle } from 'prism-shared';
import { api } from './api';

const WAYS: Array<{ kind: LearningAssetKind; label: string; hint: string; ray: string }> = [
  { kind: 'read', label: 'Read', hint: 'Digest and glossary', ray: 'coral' },
  { kind: 'listen', label: 'Listen', hint: 'Conversational narration', ray: 'amber' },
  { kind: 'watch', label: 'Watch', hint: 'Captioned visual plan', ray: 'violet' },
  { kind: 'explore', label: 'Explore', hint: 'Timeline or source data', ray: 'mint' },
  { kind: 'quiz', label: 'Quiz', hint: 'Recall plus transfer', ray: 'blue' },
];

type AssetMap = Record<string, Partial<Record<LearningAssetKind, LearningAsset>>>;

export default function Library() {
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [assets, setAssets] = useState<AssetMap>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [grade, setGrade] = useState('');
  const [homeLanguage, setHomeLanguage] = useState('');

  useEffect(() => { void load(); }, []);
  async function load() {
    try { const result = await api.sources(); setSources(result.sources); setError(''); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function generate(source: CapturedSource, kind: LearningAssetKind) {
    const key = `${source.id}:${kind}`;
    setGenerating(key); setError('');
    try {
      const asset = await api.generateAsset(source.id, kind, {
        ...(grade ? { targetGrade: Number(grade) } : {}),
        ...(homeLanguage.trim() ? { homeLanguage: homeLanguage.trim() } : {}),
      });
      setAssets((current) => ({ ...current, [source.id]: { ...current[source.id], [kind]: asset } }));
    } catch (reason) { setError((reason as Error).message); }
    finally { setGenerating(null); }
  }

  return <section className="library page-enter">
    <div className="library-head">
      <div><p className="kicker">Your learning source library</p><h1>Choose one way<br/>to make it <em>click.</em></h1><p>Each Prism ray creates only the learning material you choose. Generated rays stay cached for this source, so returning to one is immediate.</p></div>
      <div className="library-settings"><label>Target grade <select value={grade} onChange={(event)=>setGrade(event.target.value)}><option value="">Infer automatically</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Grade {i+1}</option>)}</select></label><label>Gloss language <input value={homeLanguage} onChange={(event)=>setHomeLanguage(event.target.value)} placeholder="Optional, e.g. ko" /></label></div>
    </div>
    {error && <div className="error"><span>!</span><p>{error}</p></div>}
    <div className="library-section"><div className="section-title"><div><p className="step-label">Captured sources</p><h2>Pick a source, then a ray.</h2></div><button className="secondary" onClick={()=>void load()}>Refresh</button></div>
      {!sources.length ? <EmptySources/> : <div className="source-grid">{sources.map((source) => <SourceCard key={source.id} source={source} assets={assets[source.id] ?? {}} generating={generating} onGenerate={generate}/>)}</div>}
    </div>
  </section>;
}

function SourceCard({source, assets, generating, onGenerate}:{source:CapturedSource; assets:Partial<Record<LearningAssetKind,LearningAsset>>; generating:string|null; onGenerate:(source:CapturedSource,kind:LearningAssetKind)=>Promise<void>}) {
  return <article className="source-card ray-source"><div><span className="source-domain">{domain(source.url)}</span><h3>{source.title}</h3><p>{source.text.slice(0,220)}{source.text.length>220?'…':''}</p></div><div className="ray-grid">{WAYS.map((way) => { const asset=assets[way.kind]; const pending=generating===`${source.id}:${way.kind}`; return <button className={`ray-button ${way.ray}`} key={way.kind} disabled={generating!==null} onClick={()=>void onGenerate(source,way.kind)}><span className="ray-line"/><span><b>{pending?`Generating ${way.label}…`:asset?`${way.label} ready`:way.label}</b><small>{asset?'Open cached result':way.hint}</small></span></button>; })}</div><small>Updated {new Date(source.updatedAt).toLocaleString()}</small>{WAYS.map((way)=>assets[way.kind]&&<AssetCard key={way.kind} asset={assets[way.kind]!}/>)}</article>;
}

function EmptySources(){return <div className="empty-library"><span>◇</span><h3>No sources saved yet</h3><p>Open Prism on an article or assignment and choose a learning ray. The page you explicitly choose will appear here.</p></div>}

function AssetCard({asset}:{asset:LearningAsset}) { return <section className="lazy-asset"><div className="asset-label"><span>{asset.kind}</span><small>{asset.cached?'Cached — no new AI call':'Generated now'}</small></div><AssetPayload asset={asset}/></section>; }

function AssetPayload({asset}:{asset:LearningAsset}) {
  if (asset.kind==='read') { const data=asset.payload as StudyBundle['read']; return <>{data.segments.map((segment,index)=><div key={index} className="segment"><p>{segment.text}</p><strong>Recap</strong><p>{segment.recap}</p>{segment.glosses.length>0&&<dl>{segment.glosses.map((gloss)=><div key={gloss.term}><dt>{gloss.term}</dt><dd>{gloss.definition}{gloss.homeLanguage?` · ${gloss.homeLanguage}`:''}</dd></div>)}</dl>}</div>)}</>; }
  if (asset.kind==='listen') { const data=asset.payload as StudyBundle['listen']; return <><p>{data.script}</p><small>Highlight lead: {data.highlightLeadMs}ms</small></>; }
  if (asset.kind==='watch') { const data=asset.payload as StudyBundle['watch']; return <><p className="alt-text">{data.altText}</p>{data.steps.map((step,index)=><p key={index}><strong>{step.caption}</strong><br/>{step.description}</p>)}</>; }
  if (asset.kind==='explore') { return <Explore data={asset.payload as StudyBundle['explore']}/>; }
  const data=asset.payload as StudyBundle['quiz']; return <>{data.items.map((item,index)=><details key={index}><summary>{item.stem}</summary>{item.options.map((option,optionIndex)=><p key={optionIndex} className={option.correct?'correct-option':''}><strong>{option.text}</strong> — {option.feedback}</p>)}<p>{item.explanation}</p></details>)}</>;
}

function Explore({data}:{data:StudyBundle['explore']}) { if(!data.timeline&&!data.data)return <p>No source-supported timeline or data was available.</p>; return <>{data.timeline?.sort((a,b)=>a.order-b.order).map((entry)=><p key={`${entry.order}-${entry.label}`}><strong>{entry.label}</strong><br/>{entry.detail}</p>)}{data.data&&<><strong>{data.data.caption}</strong>{data.data.series.map((series)=><p key={series.name}>{series.name}: {series.points.map((point)=>`${point.x} → ${point.y}`).join(', ')}</p>)}</>}</>; }
function domain(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return 'web source'}}
