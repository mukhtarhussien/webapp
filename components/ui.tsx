import Link from 'next/link'
import type { ReactNode } from 'react'

export function StatCard({icon,label,value,note,tone}:{icon:ReactNode;label:string;value:string;note:string;tone:string}){
  return <div className="card stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div></div>
}

export function SectionHeader({title,subtitle,href,link}:{title:string;subtitle:string;href:string;link:string}){
  return <div className="section-header"><div><h2>{title}</h2><p>{subtitle}</p></div><Link href={href}>{link} <span>←</span></Link></div>
}

export function Pill({children,tone='slate'}:{children:ReactNode;tone?:string}){return <span className={`pill ${tone}`}>{children}</span>}
export function MiniBar({value,tone='blue'}:{value:number;tone?:string}){return <div className="mini-bar"><div className={`mini-fill ${tone}`} style={{width:`${value}%`}} /></div>}
export function Avatar({name,tone='blue'}:{name:string;tone?:string}){return <span className={`avatar ${tone}`}>{name}</span>}
