import Route from './route';
import DS from 'ember-data';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';

export default Route.extend({
  redirectRoute: 'login',

  environment: computed(function() {
    return getOwner(this).resolveRegistration('config:environment');
  }),

  _redirectSuccessRoute: computed('environment', function() {
    return this.get('environment.security.defaultSuccessRoute') || 'realms';
  }),

  _redirectErrorRoute: computed('environment', function() {
    return this.get('environment.security.defaultErrorRoute') || 'login';
  }),
  routeIsProtected: true,

  session: service(),

  beforeModel: function(transition) {
    let //ctrl = this.controllerFor('login'),
      routeIsProtected = this.get('routeIsProtected');

    /*if(!ctrl) {
      ctrl = Ember.generateController(this.get('container'), 'login');
    }*/

    let session = this.get('session'),
      verifyInProgress = session.get('verifyInProgress'),
      isLoggedIn = session.get('isLoggedIn');

    if(routeIsProtected && !isLoggedIn)
    {
      let errorRoute = this.get('_redirectErrorRoute'),
        errorRouteName = null,
        errorRouteExternal = false;
      if(errorRoute.name) {
        errorRouteName = errorRoute.name;
        errorRouteExternal = errorRoute.external || false;
      } else {
        errorRouteName = errorRoute ? errorRoute.toString() : errorRoute;
      }

      let verifyCallback = function() {
        session.removeObserver('verifyInProgress', this, verifyCallback);
        if(session.get('isLoggedIn'))
        {
          //Continue with original transition
          if (transition) {
            transition.retry();
          }
          // Default back to homepage
          //potentially not needed?
          /*else {
            this.transitionTo(this.get('_redirectSuccessRoute'));
          }*/
        } else {
          if(errorRouteExternal && this.transitionToExternal) {
            this.transitionToExternal(errorRouteName, {
              queryParams: { redirect:document.location.pathname }
            });
          } else {
            this.transitionTo(errorRouteName, {
              queryParams: { redirect:document.location.pathname }
            });
          }
        }
      };
      //If there's currently a verification in progress, we wait for it to finish
      if(verifyInProgress)
      {
        if(transition)
        {
          transition.abort();
        }
        session.addObserver('verifyInProgress', this, verifyCallback);
      } else {
        if(errorRouteExternal && this.transitionToExternal) {
          this.transitionToExternal(errorRouteName, {
            queryParams: { redirect:document.location.pathname }
          });
        } else {
          this.transitionTo(errorRouteName, {
            queryParams: { redirect:document.location.pathname }
          });
        }
      }
    }
  },

  actions: {
    error(error) {
      if (error instanceof DS.UnauthorizedError) {
        this.transitionTo(this.get('_redirectErrorRoute'));
      }
    }
  }
});
