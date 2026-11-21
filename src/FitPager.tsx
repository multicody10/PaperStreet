import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function pageCapacity(height:number,rowHeight:number,overhead=0):number {
  return Math.max(1,Math.floor(Math.max(0,height-overhead)/Math.max(1,rowHeight)));
}

/** Paginates against actual rendered space, not an assumed fixed screen size. */
export function FitPager<T>({items,render,rowHeight=62,compactRowHeight=rowHeight,compactBreakpoint=630,overhead=0,empty='Nothing to show',className=''}:{
  items:readonly T[]; render:(page:T[],start:number)=>ReactNode;
  rowHeight?:number;compactRowHeight?:number;compactBreakpoint?:number;overhead?:number;empty?:string;className?:string;
}) {
  const target=useRef<HTMLDivElement|null>(null);
  const [bounds,setBounds]=useState({height:240,width:800});
  const [page,setPage]=useState(0);
  useEffect(()=>{
    const el=target.current;
    if (!el) return;
    const measure=()=>setBounds(previous=>{
      const next={height:el.clientHeight,width:el.clientWidth};
      return next.height===previous.height&&next.width===previous.width?previous:next;
    });
    const observer=new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return ()=>observer.disconnect();
  },[]);
  const compact=bounds.width<compactBreakpoint || window.innerWidth<=compactBreakpoint;
  const size=pageCapacity(bounds.height,compact?compactRowHeight:rowHeight,overhead);
  const pages=Math.max(1,Math.ceil(items.length/size));
  const current=Math.min(page,pages-1);
  const start=current*size;
  return <div className={'fit-pager '+className}>
    <div className="fit-pager-viewport" ref={target}>
      {items.length?render(items.slice(start,start+size),start):<div className="rail-empty">{empty}</div>}
    </div>
    <div className="fit-pager-controls" aria-label="List pages">
      <button type="button" onClick={()=>setPage(Math.max(0,current-1))} disabled={current===0} aria-label="Previous page"><ChevronLeft size={16}/></button>
      <span aria-live="polite">{items.length?start+1:0}–{Math.min(items.length,start+size)} of {items.length}</span>
      <button type="button" onClick={()=>setPage(Math.min(pages-1,current+1))} disabled={current>=pages-1} aria-label="Next page"><ChevronRight size={16}/></button>
    </div>
  </div>;
}

export function SectionTabs<T extends string>({items,value,onChange,label}:{
  items:readonly {id:T;label:string}[];value:T;onChange:(next:T)=>void;label:string;
}) {
  return <div className="screen-tabs" role="group" aria-label={label}>
    {items.map(item=><button type="button" key={item.id} aria-pressed={item.id===value}
      className={value===item.id?'active':''} onClick={()=>onChange(item.id)}>{item.label}</button>)}
  </div>;
}
