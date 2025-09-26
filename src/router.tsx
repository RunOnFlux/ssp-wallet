import { Navigate, createBrowserRouter } from 'react-router';

import Welcome from './pages/Welcome/Welcome.tsx';
import Create from './pages/Create/Create.tsx';
import Restore from './pages/Restore/Restore.tsx';
import Login from './pages/Login/Login.tsx';
import Home from './pages/Home/Home.tsx';
import Send from './pages/Send/Send.tsx';
import SendEVM from './pages/SendEVM/SendEVM.tsx';
import Swap from './pages/Swap/Swap.tsx';
import SecurityTest from './pages/SecurityTest/SecurityTest.tsx';
import { RouterErrorBoundary } from './components/ErrorBoundary/ErrorBoundary.tsx';

const router = createBrowserRouter([
  {
    path: '/welcome',
    element: <Welcome />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/create',
    element: <Create />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/restore',
    element: <Restore />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/home',
    element: <Home />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/send',
    element: <Send />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/sendevm',
    element: <SendEVM />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/swap',
    element: <Swap />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/security-test',
    element: <SecurityTest />,
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
