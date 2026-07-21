import { useEffect, useState } from 'react';
import Core from './Core';
import Future from './Future';
type View='home'|'core'|'future'; type Theme='light'|'dark';
function useTheme(){const[theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('prism-theme')as Theme)||('dark'));useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('prism-theme',theme)},[theme]);return[theme,()=>setTheme(t=>t==='light'?'dark':'light')]as const}
export default function App(){const[view,setView]=useState<View>(()=>(location.hash.slice(1)as View)||'home');const[theme,toggle]=useTheme();useEffect(()=>{const fn=()=>setView((location.hash.slice(1)as View)||'home');addEventListener('hashchange',fn);return()=>removeEventListener('hashchange',fn)},[]);const go=(v:View)=>{location.hash=v};return <><header className="topbar"><button className="brand" onClick={()=>go('home')}><span>◇</span> prism</button><nav aria-label="Products"><button className={view==='core'?'active':''} onClick={()=>go('core')}>Core</button><button className={view==='future'?'active':''} onClick={()=>go('future')}>Future</button></nav><button className="icon-button" onClick={toggle} aria-label={`Switch to ${theme==='light'?'dark':'light'} theme`}>{theme==='light'?'◐':'◑'}</button></header><main>{view==='home'?<Home go={go}/>:view==='core'?<Core/>:<Future/>}</main><footer><span>Prism is an educational prototype.</span><span>One concept. As many ways as it takes.</span></footer></>}
const RAYS=[
  {to:'core',   label:'Predict first',   hint:'Guess before you calculate', y:125, c:'var(--ray-1)'},
  {to:'core',   label:'Watch the curve', hint:'Move the inputs live',       y:186, c:'var(--ray-2)'},
  {to:'core',   label:'Apply it new',    hint:'Prove it somewhere else',    y:247, c:'var(--ray-3)'},
  {to:'future', label:'Name your goals', hint:'Decide what money is for',   y:308, c:'var(--ray-4)'},
  {to:'future', label:'Model the path',  hint:'Time, fees, contributions',  y:369, c:'var(--ray-5)'},
  {to:'future', label:'Picture it',      hint:'Your horizon, drawn',        y:430, c:'var(--ray-6)'},
];

function Home({go}:{go:(v:View)=>void}){
  return <section className="home page-enter">
    <div className="hero-copy">
      <p className="kicker">Adaptive learning, refracted</p>
      <h1>Find the way<br/>that makes it <em>click.</em></h1>
      <p className="lede">The same idea can look completely different through a graph, a story, a simulation, or your own future.</p>
      <div className="home-actions">
        <button className="primary" onClick={()=>go('core')}>Explore the math <span>↗</span></button>
        <button className="secondary" onClick={()=>go('future')}>Picture your future <span>→</span></button>
      </div>
    </div>

    <div className="prism-art">
      <svg className="prism-scene" viewBox="0 0 720 520" role="group"
           aria-label="One idea entering a prism and refracting into six ways to learn it.">
        <defs>
          {/* horizontal path => zero-height bbox, so userSpaceOnUse is required */}
          <linearGradient id="pxBeam" gradientUnits="userSpaceOnUse" x1="70" y1="250" x2="229" y2="250">
            <stop offset="0" stopColor="var(--ink)" stopOpacity=".18"/>
            <stop offset="1" stopColor="var(--ink)" stopOpacity=".95"/>
          </linearGradient>
          <linearGradient id="pxGlass" x1="0" y1="0" x2=".8" y2="1">
            <stop offset="0"   stopColor="var(--ink)" stopOpacity=".20"/>
            <stop offset=".55" stopColor="var(--ink)" stopOpacity=".06"/>
            <stop offset="1"   stopColor="var(--ink)" stopOpacity=".14"/>
          </linearGradient>
          <filter id="pxSoft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <text className="px-source" x="70" y="235">any page</text>
        <path className="px-in-glow" d="M 70 250 L 229 250"/>
        <path className="px-in"      d="M 70 250 L 229 250"/>

        {/* 3D prism body */}
        <path className="px-side" d="M 300 90 L 330 72 L 450 342 L 420 360 Z"/>
        <path className="px-base" d="M 180 360 L 210 342 L 450 342 L 420 360 Z"/>
        <path className="px-face" d="M 300 90 L 420 360 L 180 360 Z"/>
        <path className="px-edge" d="M 294 108 L 196 348"/>
        <path className="px-internal" d="M 229 250 L 379 268"/>

        <g className="px-fan">
          {RAYS.map(r=>
            <a className="px-ray" key={r.label} href={'#'+r.to} aria-label={r.label+' — '+r.hint}>
              <path className="px-hit"  d={`M 379 268 L 555 ${r.y}`}/>
              <path className="px-beam" style={{stroke:r.c}} filter="url(#pxSoft)" d={`M 379 268 L 555 ${r.y}`}/>
              <text className="px-label" x="570" y={r.y+4}>{r.label}</text>
              <text className="px-hint"  x="570" y={r.y+21}>{r.hint}</text>
            </a>
          )}
        </g>
      </svg>
    </div>

    <div className="trust"><b>Predict first</b><b>Change the method</b><b>Apply it somewhere new</b></div>
  </section>
}
