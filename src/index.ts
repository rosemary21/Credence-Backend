import app from './app.js'

const PORT = process.env.PORT ?? 3000

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Credence API listening on http://localhost:${PORT}`)
  })
}

export { app }
export default app
