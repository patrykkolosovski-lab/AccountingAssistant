import {invoke,isTauri} from '@tauri-apps/api/core';
import {empty,type Data,type Receipt} from './types';
export const desktop=isTauri();
export async function load():Promise<Data>{if(!desktop)return structuredClone(empty);return invoke('load_data');}
export async function save(data:Data,action:string):Promise<Data>{if(!desktop)throw Error('Open the desktop app to save records. Browser mode is a visual preview only.');return invoke('save_data',{data,action});}
export async function importPaths(paths:string[]):Promise<Receipt[]>{return invoke('import_paths',{paths});}
export async function readFile(id:string):Promise<Uint8Array>{const b=await invoke<string>('read_evidence',{id});return Uint8Array.from(atob(b),c=>c.charCodeAt(0));}
export async function importBytes(file:File):Promise<Receipt>{const bytes=Array.from(new Uint8Array(await file.arrayBuffer()));return invoke('import_bytes',{name:file.name,bytes});}
export async function writeExport(path:string,bytes:Uint8Array){return invoke('write_export',{path,bytes:Array.from(bytes)});}
