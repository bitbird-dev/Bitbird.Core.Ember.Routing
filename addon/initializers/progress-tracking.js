import { run } from '@ember/runloop'
import { computed } from '@ember/object'
import DS from 'ember-data'

export function initialize(/* application */) {
  DS.Model.reopen({
    _hasManyProgressKeys: null,

    init() {
      this._hasManyProgressKeys = {};
      this._super();
    },

    inProgress: computed('isLoading', 'isSaving', {
      get() {
        if(this.get('isLoading') || this.get('isSaving')) {
          return true;
        }

        for(let prop in this._hasManyProgressKeys) {
          if (this._hasManyProgressKeys.hasOwnProperty(prop)) {
            return true;
          }
        }
        return false;
      }
    }),

    _notifyFindAllProgress: function(key, isBegin) {
      run.schedule('actions', this, function() {
        if(isBegin) {
          this._hasManyProgressKeys[key] = true;
        } else {
          delete this._hasManyProgressKeys[key];
        }
        this.notifyPropertyChange('inProgress');
      });
    }
  });
}

export default {
  name: 'progress-tracking',
  initialize
};
