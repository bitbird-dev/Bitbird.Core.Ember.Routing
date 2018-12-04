import Ember from 'ember';
import Route from './route';
import DS from 'ember-data';

export default Route.extend({
  routeIsProtected: true,

  beforeModel: function(transition) {
    let ctrl = this.controllerFor('login'),
      routeIsProtected = this.get('routeIsProtected');

    if(!ctrl) {
      ctrl = Ember.generateController(this.get('container'), 'login');
    }

    let verifyInProgress = this.session.get('verifyInProgress'),
      isLoggedIn = this.session.get('isLoggedIn');

    if(routeIsProtected && !isLoggedIn)
    {
      let verifyCallback = function() {
        this.session.removeObserver('verifyInProgress', this, verifyCallback);
        if(this.session.get('isLoggedIn'))
        {
          //Continue with original transition
          if (transition) {
            transition.retry();
          }
          // Default back to homepage
          else {
            this.transitionToRoute('realms');
          }
        } else {
          this.transitionTo('login', {
            queryParams: { redirect:document.location.pathname }
          });
        }
      };
      //If there's currently a verification in progress, we wait for it to finish
      if(verifyInProgress)
      {
        if(transition)
        {
          transition.abort();
        }
        this.session.addObserver('verifyInProgress', this, verifyCallback);
      } else {
        this.transitionTo('login', {
          queryParams: { redirect:document.location.pathname }
        });
      }
    }
  },

  actions: {
    error(error) {
      if (error instanceof DS.UnauthorizedError) {
        this.transitionTo('login');
      }
    }
  }
});
