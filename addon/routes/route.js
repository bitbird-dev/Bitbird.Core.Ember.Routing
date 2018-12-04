import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import Messages from 'bitbird-core-ember-i18n/mixins/messages';
import { computed, observer } from '@ember/object';
import { getOwner } from '@ember/application';
import $ from 'jquery';

export default Route.extend(Messages, {
  session: service(),
  init() {
    this._super(...arguments);
    this._realmDidChange();
    $('html').addClass(this.get('themeClassName'));
  },
  activate() {
    $('body').addClass(this.get('routeClassName'));
  },

  deactivate() {
    if(this.delete && this.get('deleteNewModelOnDeactivate') && this.get('controller.model.isNew')) {
      this.delete(this.get('controller.model'));
    }
    $('body').removeClass(this.get('routeClassName'));
  },

  /**
   * If true, deletes model in 'new' state when leaving the route
   */
  deleteNewModelOnDeactivate: true,

  routeClassName: computed('routeName', function() {
    let routeClassName = this.routeName.replace(/\./g, '-').dasherize();
    if(routeClassName === 'application') {
      routeClassName = 'cleanbird';
    }

    let brandKey = this.get('session.user.realm.brandKey');
    if(brandKey) {
      routeClassName = 'theme-' + brandKey + ' ' + routeClassName;
    }
    return routeClassName;
  }),

  themeClassName: computed('session.user.realm.brandKey', function() {
    let brandKey = this.get('session.user.realm.brandKey');
    if(brandKey) {
      brandKey = 'theme-' + brandKey;
    }
    return brandKey;
  }),

  _realmDidChange: observer('session', 'session.user', 'session.user.realm', 'session.user.realm.brandKey', function() {
    this.notifyPropertyChange('routeClassName');
  }),

  actions: {
    willTransition(transition) {
      let model = this.controller.get('model');

      if(!model || !model.get) return true;

      let isDirty = model.get('isDirty'),
        isDeleted = model.get('isDeleted'),
        routesController = getOwner(this).lookup('controller:realms');

      // Notify routes-route that we're about to loose unsaved changes
      if (isDirty && !isDeleted) {
        transition.abort();
        routesController.set('onCancelRouteChange', function() {});
        routesController.set('onRevertBeforeRouteChange', function() {
          model.rollback();
          transition.retry();
        });
      } else {
        return true;
      }
    }
  }
});
