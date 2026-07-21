import type { CapturedSource, GenerateStoredSourceRequest, LearningAsset, LearningAssetKind, LearningMaterial } from 'prism-shared';
import type { Content,GrowthResult,InvestResult } from './types';
async function request<T>(url:string,init?:RequestInit):Promise<T>{const response=await fetch(url,{headers:{'content-type':'application/json'},...init});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Prism could not reach the lesson.');}return response.json() as Promise<T>}
export const api={
  growth:(body:unknown)=>request<GrowthResult>('/api/core/growth',{method:'POST',body:JSON.stringify(body)}),
  invest:(body:unknown)=>request<InvestResult>('/api/future/invest',{method:'POST',body:JSON.stringify(body)}),
  content:()=>request<Content>('/api/future/content'),
  sources:()=>request<{sources:CapturedSource[]}>('/api/sources'),
  materials:()=>request<{materials:LearningMaterial[]}>('/api/materials'),
  generate:(sourceId:string,body:GenerateStoredSourceRequest)=>request<LearningMaterial>(`/api/sources/${encodeURIComponent(sourceId)}/generate`,{method:'POST',body:JSON.stringify(body)}),
  generateAsset:(sourceId:string,kind:LearningAssetKind,body:GenerateStoredSourceRequest)=>request<LearningAsset>(`/api/sources/${encodeURIComponent(sourceId)}/assets/${kind}`,{method:'POST',body:JSON.stringify(body)}),
};
