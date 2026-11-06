import { createElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/Shell';
import { pageRoutes } from './pages/pageroutes';

function App() {
  const publicRoutes = pageRoutes.filter((route) => ['/login', '/register', '/forgot-password'].includes(route.path));
  const privateRoutes = pageRoutes.filter((route) => !publicRoutes.includes(route));
  const routeElements = [
    ...publicRoutes.map((route) => createElement(Route, { key: route.path, path: route.path, element: route.element })),
    createElement(Route, { key: 'private-layout', element: createElement(AppLayout) },
      privateRoutes.map((route) => createElement(Route, { key: route.path, path: route.path, element: route.element })),
    ),
    createElement(Route, { key: 'not-found', path: '*', element: createElement('div', { style: { padding: 48 } }, 'Page not found') }),
  ];
  return createElement(SessionProvider, null,
    createElement(ToastProvider, null,
      createElement(BrowserRouter, null, createElement(Routes, null, routeElements)),
    ),
  );
}

export default App;