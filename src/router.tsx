import { Navigate, createBrowserRouter } from 'react-router-dom';

import Welcome from './pages/Welcome/Welcome.tsx';
import Create from './pages/Create/Create.tsx';
import Restore from './pages/Restore/Restore.tsx';
import Login from './pages/Login/Login.tsx';
import Home from './pages/Home/Home.tsx';

const router = createBrowserRouter([
  {
    path: '/welcome',
    element: <Welcome />,
  },
  {
    path: '/create',
    element: <Create />,
  },
  {
    path: '/restore',
    element: <Restore />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/home',
    element: <Home />,
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
