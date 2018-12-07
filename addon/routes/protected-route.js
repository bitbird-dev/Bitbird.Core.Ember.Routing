import Ember from 'ember';
import Route from './route';
import DS from 'ember-data';
import { inject as service } from '@ember/service';

export default Route.extend({
  routeIsProtected: true,

  session: service(),

  beforeModel: function(transition) {
    let ctrl = this.controllerFor('login'),
      routeIsProtected = this.get('routeIsProtected');

    if(!ctrl) {
      ctrl = Ember.generateController(this.get('container'), 'login');
    }

    let session = this.get('session'),
      verifyInProgress = session.get('verifyInProgress'),
      isLoggedIn = session.get('isLoggedIn');

    if(routeIsProtected && !isLoggedIn)
    {
      let verifyCallback = function() {
        session.removeObserver('verifyInProgress', this, verifyCallback);
        if(session.get('isLoggedIn'))
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
        session.addObserver('verifyInProgress', this, verifyCallback);
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
