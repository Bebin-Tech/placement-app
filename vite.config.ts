<<<<<<< HEAD
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://127.0.0.1:5000' } } })
=======
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()] })
>>>>>>> e9d2c44647ce0c4bbbcc2be571c954d38f42043d
