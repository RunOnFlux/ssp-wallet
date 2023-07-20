import { Navigate, createBrowserRouter } from 'react-router-dom';

import Welcome from './routes/Welcome/Welcome.tsx';
import Create from './routes/Create/Create.tsx';
import Restore from './routes/Restore/Restore.tsx';
import Login from './routes/Login/Login.tsx';
import Home from './routes/Home/Home.tsx';

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
