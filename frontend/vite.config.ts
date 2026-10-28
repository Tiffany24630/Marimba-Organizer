import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({mode})=>{
  const env=loadEnv(mode, root, '')
  const api=env.VITE_API_URL||
    (mode==='production'?'/api':'http://localhost:8000/api')
  const deploy=env.VITE_DEPLOY_ENV||''
  if(deploy==='production' &&
     (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(api) ||
      (!api.startsWith('/') && !api.startsWith('https://')))){
    throw new Error('VITE_API_URL de produccion debe ser /api o una URL HTTPS no local')
  }
  return {
    root,
    plugins: [react()],
    define: {'__MARIMBA_API_BASE__': JSON.stringify(api)},
    build: {rollupOptions: {input: `${root}index.html`}},
  }
})
