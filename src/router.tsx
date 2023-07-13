import { Navigate, createBrowserRouter } from 'react-router-dom';

import App from './routes/App/App.tsx';
import Create from './routes/Create/Create.tsx';
import Login from './routes/Login/Login.tsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
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
    element: <Navigate to="/" replace />,
  },
]);

export default router;
