import {mkdir,copyFile,readdir,writeFile,access} from 'node:fs/promises';
const dir='public/ocr';await mkdir(dir,{recursive:true});
await copyFile('node_modules/tesseract.js/dist/worker.min.js',dir+'/worker.min.js');
for(const file of await readdir('node_modules/tesseract.js-core'))if(/\.(wasm|js)$/.test(file))await copyFile('node_modules/tesseract.js-core/'+file,dir+'/'+file);
for(const lang of ['eng','nld']){const out=`${dir}/${lang}.traineddata.gz`;try{await access(out);}catch{const r=await fetch(`https://tessdata.projectnaptha.com/4.0.0/${lang}.traineddata.gz`);if(!r.ok)throw Error(`Language download failed: ${r.status}`);await writeFile(out,Buffer.from(await r.arrayBuffer()));}}
console.log('Offline OCR resources ready.');
