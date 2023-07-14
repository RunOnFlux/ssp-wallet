import { Navigate, createBrowserRouter } from 'react-router-dom';

import Welcome from './routes/Welcome/Welcome.tsx';
import Create from './routes/Create/Create.tsx';
import Login from './routes/Login/Login.tsx';

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
    path: '/login',
    element: <Login />,
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
