import { createBrowserRouter, Navigate } from 'react-router-dom'
import HomePage from '@/views/HomePage'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/chat', element: <Navigate to="/" replace /> },
])

export default router
