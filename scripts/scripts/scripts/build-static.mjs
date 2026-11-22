import {cp,rm} from 'node:fs/promises';
const out=new URL('../public/',import.meta.url);
await rm(out,{recursive:true,force:true});
await cp(new URL('../web/',import.meta.url),out,{recursive:true});
console.log('Static workbench built. No API or source uploads.');
