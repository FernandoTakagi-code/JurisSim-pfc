import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import express from 'express';
import {emailFrontendContext,emailFrontendUrl} from './email-frontend';
import {errorHandler} from '../middlewares/error-handler';
import {isValidAppUrl} from './app-url';
beforeEach(()=>{vi.stubEnv('NODE_ENV','development');vi.stubEnv('APP_PUBLIC_URL','http://localhost:5173');vi.stubEnv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5180,https://app.example.invalid');});
afterEach(()=>vi.unstubAllEnvs());
async function request(origin?:string,extra:Record<string,string>={}){
  const app=express();app.use(emailFrontendContext);app.post('/',async(_req,res)=>{await new Promise(resolve=>setTimeout(resolve,5));res.json({url:emailFrontendUrl()});});app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try{const result=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}`,{method:'POST',headers:{...(origin?{Origin:origin}:{}),...extra}});return {status:result.status,body:await result.json()};}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it.each(['http://localhost:5173','http://127.0.0.1:5180','https://app.example.invalid'])('uses the exact authorized originating frontend %s',async origin=>{expect(await request(origin)).toMatchObject({status:200,body:{url:origin}});});
it('does not trust Host, Referer or forwarded host/protocol',async()=>{expect(await request(undefined,{'X-Forwarded-Host':'attacker.invalid','X-Forwarded-Proto':'https',Referer:'https://attacker.invalid/'})).toMatchObject({body:{url:'http://localhost:5173'}});});
it.each(['https://attacker.invalid','https://app.example.invalid.attacker.invalid','null','http://localhost:5173/'])('rejects unlisted or malformed origin %s',async origin=>{expect((await request(origin)).status).toBe(403);});
it('keeps concurrent request origins isolated and preserves the configured fallback',async()=>{const results=await Promise.all([request('http://localhost:5173'),request('http://127.0.0.1:5180')]);expect(results[0].body.url).toBe('http://localhost:5173');expect(results[1].body.url).toBe('http://127.0.0.1:5180');expect(emailFrontendUrl()).toBe('http://localhost:5173');});
it('preserves a configured base path for its own origin',async()=>{vi.stubEnv('APP_PUBLIC_URL','https://app.example.invalid/jurissim/');expect((await request('https://app.example.invalid')).body.url).toBe('https://app.example.invalid/jurissim');});
it('requires configured HTTPS frontend in production and rejects local origins',async()=>{vi.stubEnv('NODE_ENV','production');vi.stubEnv('APP_PUBLIC_URL','https://app.example.invalid');expect((await request('http://localhost:5173')).status).toBe(403);expect((await request('https://app.example.invalid')).body.url).toBe('https://app.example.invalid');expect(isValidAppUrl('https://localhost')).toBe(false);});
it('H4.12 supports the exact published JurisSim origin only when explicitly authorized',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('APP_PUBLIC_URL','https://jurissim.vercel.app');vi.stubEnv('CORS_ORIGINS','https://jurissim.vercel.app');
  expect((await request('https://jurissim.vercel.app')).body.url).toBe('https://jurissim.vercel.app');
  expect((await request('https://jurissim.vercel.app.attacker.invalid')).status).toBe(403);
});
it.each(['https://app.example.invalid/"onclick=bad','https://app.example.invalid/\\attacker','https://user:secret@app.example.invalid','https://app.example.invalid/?token=secret'])('rejects unsafe configured frontend %s',url=>{expect(emailFrontendUrl(url)).toBeUndefined();});
