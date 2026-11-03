import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    base: '/',
    plugins: [
        react(),
        {
            name: 'apk-mime-type',
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    if (req.url && req.url.startsWith('/TitleDeeds.apk')) {
                        res.setHeader('Content-Type', 'application/vnd.android.package-archive')
                        res.setHeader('Content-Disposition', 'attachment; filename="TitleDeeds.apk"')
                    }
                    next()
                })
            }
        }
    ],
    build: {
        // Output production build to Django's static files directory
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        watch: {
            ignored: ['**/android/**', '**/dist/**']
        },
        host: true,
        port: 5173,
        proxy: {
            '/api': 'http://127.0.0.1:8000',
            '/media': 'http://127.0.0.1:8000',
        }
    }
}))

