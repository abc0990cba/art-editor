import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from '@tanstack/react-router'

import { HomeScreen } from '../features/projects/home-screen.component.tsx'
import { loadProject } from '../storage/projects.ts'
import { ProjectRoute } from './project-route.component.tsx'
import { validateProjectSearch } from './project-search.ts'

const rootRoute = createRootRoute({})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRouteView,
})

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId',
  validateSearch: validateProjectSearch,
  // the library entry is the single source of truth for what opens here; a missing id
  // (deleted elsewhere, stale link) falls back to the home screen
  loader: async ({ params }) => {
    const entry = await loadProject(params.projectId)
    if (!entry) throw redirect({ to: '/', replace: true })
    return entry
  },
  component: ProjectRoute,
})

/** Home screen wrapper: features stay app-agnostic, navigation is handed over as a callback. */
function HomeRouteView() {
  const navigate = useNavigate()
  return (
    <HomeScreen
      onOpen={(id) => void navigate({ to: '/p/$projectId', params: { projectId: id } })}
    />
  )
}

const routeTree = rootRoute.addChildren([homeRoute, projectRoute])

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <HomeRouteView />,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
