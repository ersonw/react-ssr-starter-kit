import React from 'react'
import ReactDOM from 'react-dom'
import ReactDomServer from 'react-dom/server'
import BrowserRouter from 'react-router/BrowserRouter'
import { ServerRouter, createServerRenderContext } from 'react-router'
import { matchRoutesToLocation } from 'lib/react-router-addons-routes'
import ApolloClient, { createNetworkInterface } from 'apollo-client'
import { getDataFromTree } from 'react-apollo/lib/server'
import createStore from './store/createStore'
import CoreLayout from './layouts/CoreLayout'

import { login } from 'routes/Auth/modules/github/githubModule'
// import { login } from 'routes/Auth/modules/moqui/moquiModule'

class App {
  store = null

  constructor () {
    // ========================================================
    // Store Instantiation
    // ========================================================
    const initialState = window.___INITIAL_STATE__
    const networkInterface = createNetworkInterface({
      uri: 'https://api.github.com/graphql'
//       uri: 'http://3pl.test.com/graphql/v1'
    })

    this.client = new ApolloClient({
      ssrMode: !!window.__IS_SSR__,
      networkInterface
    })
    this.store = createStore(this.client, initialState)

    const that = this
    networkInterface.use([{
      applyMiddleware (req, next) {
        if (!req.options.headers) {
          req.options.headers = {}  // Create the header object if needed.
        }

        // Send the login token in the Authorization header
        req.options.headers.Authorization = `Bearer ${that.store.getState().auth.github.token}`
//         req.options.headers.api_key = `${that.store.getState().auth.moqui.apiKey}`
        next()
      }
    }])
  }

  render () {
    const store = this.store
    // ========================================================
    // Render Setup
    // ========================================================
    let render

    if (window.__APP_BASE_PATH__ === undefined) {
      window.__APP_BASE_PATH__ = ''
    }

    if (!window.__IS_SSR__) {
      const MOUNT_NODE = document.getElementById('root')

      render = () => {
        if (!__DEPLOY__) login()(this.store.dispatch) // eslint-disable-line no-undef
        const client = this.client
        // routes should be here and in require form so that HMR works
        const rootRoute = require('./routes/index').default(store)
        ReactDOM.render(
          <BrowserRouter>
            {
              ({ action, location, router }) => <CoreLayout {...{ router,
                action,
                location,
                store,
                client,
                routes: rootRoute.routes,
                basePath: rootRoute.pattern }} />
            }
          </BrowserRouter>,
          MOUNT_NODE
        )
      }

      // ========================================================
      // Developer Tools Setup
      // ========================================================
      if (__DEV__) {
        if (window.devToolsExtension) {
          window.devToolsExtension.open()
        }
      }

      // This code is excluded from production bundle
      if (__DEV__) {
        if (module.hot) {
          // Development render functions
          const renderApp = render
          const renderError = (error) => {
            const RedBox = require('redbox-react').default

            ReactDOM.render(<RedBox error={error} />, MOUNT_NODE)
          }

          // Wrap render in try/catch
          render = () => {
            try {
              renderApp()
            } catch (error) {
              renderError(error)
            }
          }

          // Setup hot module replacement
          module.hot.accept('./routes/index', () =>
            setImmediate(() => {
              ReactDOM.unmountComponentAtNode(MOUNT_NODE)
              render()
            })
          )
        }
      }
    } else {
      const client = this.client
      const context = createServerRenderContext()
      const requestUrl = window.__REQ_URL__ || '/'
      const location = { pathname: requestUrl }

      const rootRoute = require('./routes/index').default(store)
      const { matchedRoutes, params } = matchRoutesToLocation(rootRoute.routes, location, [], {}, rootRoute.pattern)

      const component = (
        <ServerRouter location={requestUrl} context={context}>
          {({ action, location, router }) =>
            <CoreLayout {...{ router,
              action,
              location,
              store,
              client,
              routes: rootRoute.routes,
              basePath: rootRoute.pattern }} />}
        </ServerRouter>
      )
      render = () => {
        return login()(store.dispatch).then(() => {
          return Promise.all(
            matchedRoutes.filter(route => route.component.loadData).map(route =>
              route.component.loadData(store, params))
          ).then(() => {
            return getDataFromTree(component).then(() => {
              return ReactDomServer.renderToString(component)
            })
          })
        })
      }
    }
    return render()
  }

  getState () {
    return Java.asJSONCompatible(this.store.getState()) // eslint-disable-line no-undef
  }
}

// ========================================================
// Go!
// ========================================================
export default App

if (!window.__IS_SSR__) {
  new App().render()
}
