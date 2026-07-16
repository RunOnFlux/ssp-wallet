import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import PillarLoader from './components/PillarLoader/PillarLoader.tsx';

import Welcome from './pages/Welcome/Welcome.tsx';
import Create from './pages/Create/Create.tsx';
import Restore from './pages/Restore/Restore.tsx';
import Login from './pages/Login/Login.tsx';
import Home from './pages/Home/Home.tsx';
import WalletShell from './components/WalletShell/WalletShell.tsx';
import Settings from './components/Settings/Settings.tsx';
import { RouterErrorBoundary } from './components/ErrorBoundary/ErrorBoundary.tsx';

// Code-split the heavier flows (and the chain SDKs they pull in) so the popup
// only loads Login/Home to first paint. These are lazily fetched on first
// navigation.
// Unified 3-step send flow — /send, /sendevm and /sendsol are aliases so
// every existing navigate() + location.state contract keeps working; the
// per-chain strategy is picked internally by the active chain's chainType.
const SendFlow = lazy(() => import('./pages/SendFlow/SendFlow.tsx'));
const Swap = lazy(() => import('./pages/Swap/Swap.tsx'));
const Portfolio = lazy(() => import('./pages/Portfolio/Portfolio.tsx'));
const Activity = lazy(() => import('./pages/Activity/Activity.tsx'));
const SecurityTest = lazy(
  () => import('./pages/SecurityTest/SecurityTest.tsx'),
);

const RouteFallback = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
    }}
  >
    <PillarLoader size={44} />
  </div>
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

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
  // Authenticated tabs share the WalletShell chrome (identity bar + tab bar +
  // wallet-init side effects + always-mounted SSP Key sync). Each tab renders
  // into the shell's <Outlet/>.
  {
    element: <WalletShell />,
    errorElement: <RouterErrorBoundary />,
    children: [
      { path: '/home', element: <Home /> },
      { path: '/portfolio', element: withSuspense(<Portfolio />) },
      { path: '/activity', element: withSuspense(<Activity />) },
      { path: '/settings', element: <Settings /> },
    ],
  },
  {
    path: '/send',
    element: withSuspense(<SendFlow />),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/sendevm',
    element: withSuspense(<SendFlow />),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/sendsol',
    element: withSuspense(<SendFlow />),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/swap',
    element: withSuspense(<Swap />),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '/security-test',
    element: withSuspense(<SecurityTest />),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
