import Ember from 'ember'
import DS from 'ember-data'
const _UNSET = {};
import { A } from '@ember/array';
import { computed } from '@ember/object';
import { isPresent, isEmpty } from '@ember/utils';

export function initialize(/* application */) {
  DS.Model.reopen({
    changeTrackingOptions: null,

    internalChangeTrackingOptions: computed('changeTrackingOptions', function () {
      return Object.assign({
        attributes: true, //true, false, []
        belongsTo: true, //true, false, []
        hasMany: false, //true, false, []
        deep: [], //[]
        exclude: [] //[]
      }, this.get('changeTrackingOptions'));
    }),

    _isRollingBack: false,
    _trackedAttributes: null,
    _trackedRelations: null,

    changedAttributeKeys: null,
    changedRelationKeys: null,

    changedKeys: computed('changedRelationKeys{.length,.@each}', 'changedAttributeKeys{.length,.@each}', function() {
      let changedAttributeKeys = this.get('changedAttributeKeys') || [],
        changedRelationKeys = this.get('changedRelationKeys') || [];

      return changedAttributeKeys.concat(changedRelationKeys).sort();
    }),

    isDirty: computed('changedAttributeKeys{.@each}','changedRelationKeys{.@each}', function() {
      return this.get('changedAttributeKeys.length') > 0 || this.get('changedRelationKeys.length') > 0;
    }),

    /************** Attributes ***************/

    _scanAttributes() {
      if(this.get('internalChangeTrackingOptions.attributes') === false) return;
      this.eachAttribute(function(name) {
        if(!this._canTrackProperty("attributes", name)) return false;
        this._trackedAttributes[name] = this.get(name);
        this.addObserver(name, this, '__attributeDidChange');
      }, this);
    },

    _rollbackAttributes() {
      let changedAttributeKeys = this.get('changedAttributeKeys');
      changedAttributeKeys.forEach(function(key) {
        if(this.get('isDeleted')) return false;
        this.set(key, this._trackedAttributes[key]);
        this._trackedAttributes[key] = undefined;
      }, this);
      changedAttributeKeys.clear();
    },

    __attributeDidChange(sender, key) {
      if(this._isRollingBack) return;

      let currentValue = this.get(key),
        originalValue = this._trackedAttributes[key];

      if(this.__attributeValueEquals(currentValue, originalValue)) {
        this.__removeChangedAttributeKey(key);
      } else {
        this.__addOrUpdateChangedAttributeKey(key);
      }
    },

    __attributeValueEquals(v1, v2) {
      if(v1 === v2) {
        return true;
      }

      if(isEmpty(v1) && isEmpty(v2)) {
        return true;
      }

      return v1 && v2 && v1.toString() === v2.toString();
    },

    __addOrUpdateChangedAttributeKey(name) {
      let changedAttributeKeys = this.get('changedAttributeKeys');
      if(changedAttributeKeys.indexOf(name) > -1) return;
      changedAttributeKeys.pushObject(name);
    },

    __removeChangedAttributeKey(name) {
      let changedAttributeKeys = this.get('changedAttributeKeys');
      if(changedAttributeKeys.indexOf(name) === -1) return;
      changedAttributeKeys.removeObject(name);
    },

    /************** Relations ***************/

    _scanRelations() {
      if(!this.get('internalChangeTrackingOptions.belongsTo') && !this.get('internalChangeTrackingOptions.hasMany')) return;
      this.eachRelationship(function(name, meta) {
        if(!this._canTrackProperty(meta.kind, name)) return false;

        let canDeepTrackProperty = this._canDeepTrackProperty(meta.kind, name);

        if(meta.kind === "belongsTo") {
          let reference = this.belongsTo(name),
            id = reference.id();

          if (!id) {
            id = _UNSET;
          }

          this._trackedRelations[name] = id;
          this.addObserver(name, this, '__belongsToRelationDidChange');
          if(canDeepTrackProperty) {
            this.addObserver(`${name}.isDirty`, this, '__belongsToRelationDidChange');
          }
        }
        else if(meta.kind === "hasMany") {
          let reference = this.hasMany(name),
            relationship = reference.hasManyRelationship;

          if(relationship.hasAnyRelationshipData) {//.hasLoaded) {
            this.__hasManyIsReady.call(this, name);
            this.addObserver(`${name}.@each`, this, '__hasManyRelationDidChange');
            this.addObserver(`${name}.length`, this, '__hasManyRelationDidChange');
            if(canDeepTrackProperty)
            {
              this.addObserver(`${name}.@each.isDirty`, this, '__hasManyRelationDidChange');
            }
          }
          else
          {
            this.addObserver(name + '.isLoaded', this, '__hasManyDidLoad');
          }
        }
      }, this);
    },

    __hasManyIsReady(key) {
      let reference = this.hasMany(key),
        ids = reference.ids();

      this._trackedRelations[key] = ids;
    },

    __hasManyDidLoad(sender, key) {
      this.removeObserver(key, this, '__hasManyDidLoad');
      key = key.replace('.isLoaded', '');

      let canDeepTrackProperty = this._canDeepTrackProperty("hasMany", key);

      this.__hasManyIsReady.call(this, key);
      this.addObserver(`${key}.@each`, this, '__hasManyRelationDidChange');
      if(canDeepTrackProperty)
      {
        this.addObserver(`${key}.@each.isDirty`, this, '__hasManyRelationDidChange');
      }
    },

    _rollbackRelations() {
      let changedRelationKeys = this.get('changedRelationKeys');
      changedRelationKeys.forEach(function(key) {
        //this.set(key, this._trackedRelations[key]);
        let relationship = this.relationshipFor(key),
          type = this.relationshipFor(key).type,
          canDeepTrackProperty = this._canDeepTrackProperty(relationship.kind, key);

        if(relationship.kind === "belongsTo") {
          let id = this._trackedRelations[key],
            oldValue = id,
            reference = this.belongsTo(key),
            currentValue = reference.id();

          // roll back deep tracked properties
          if(currentValue && canDeepTrackProperty && reference.belongsToRelationship.hasAnyRelationshipData) {
            let record = this.store.peekRecord(reference.type, currentValue);
            if(record && record.get('isDirty')) {
              record.rollback();
            }
          }

          if (isPresent(id)) {
            oldValue = this.store.peekRecord(type, id);
          }

          //Value was never touched
          if(oldValue !== _UNSET)
          {
            if(oldValue === null) {
              this.set(key, null);
            } else {
              this.set(key, oldValue);
            }
          }

          this._trackedRelations[key] = _UNSET;
        }
        else if(relationship.kind === "hasMany") {
          let ids = this._trackedRelations[key];

          // roll back deep tracked properties
          if(this.get(key)) {
            if(canDeepTrackProperty){
              this.get(key).forEach(function(currentValue) {
                if(currentValue && currentValue.rollback) currentValue.rollback();
              }, this);
            }
            this.get(key).clear();
          }

          if (isPresent(ids)) {
            if(!this.get(key)) {
              this.set(key, A());
            }
            ids.forEach(function(id) {
              if(id) {
                let oldValue = this.store.peekRecord(type, id);
                if(oldValue)
                {
                  oldValue.rollback();
                  this.get(key).pushObject(oldValue);
                }
              }
            }, this);
          }

          this._trackedRelations[key] = _UNSET;
        }
      }, this);
      changedRelationKeys.clear();
    },

    _resetRelations() {
      let changedRelationKeys = this.get('changedRelationKeys');
      if(!changedRelationKeys) return;

      changedRelationKeys.forEach(function(key) {
        let relationship = this.relationshipFor(key);

        if(relationship.kind === "belongsTo") {
          if(this.get(key) && this.get(key).reset) {
            this.get(key).reset();
          }
        }
        else if(relationship.kind === "hasMany") {
          if(this.get(key)) {
            this.get(key).forEach(function(currentValue) {
              if(currentValue && currentValue.reset) currentValue.reset();
            }, this);
          }
        }
      }, this);
    },

    __belongsToRelationDidChange(sender, key) {
      if(this._isRollingBack) return;

      key = key.replace('.isDirty', '');

      let reference = this.belongsTo(key),
        relationship = reference.belongsToRelationship,
        currentValue = reference.id(),
        originalValue = this._trackedRelations[key],
        canDeepTrackProperty = this._canDeepTrackProperty("belongsTo", key),
        isChangeAssumed = false;

      if(relationship.relationshipIsEmpty) {
        if(relationship.hasAnyRelationshipData) {
          if(originalValue === _UNSET) {
            originalValue = this._trackedRelations[key] = undefined;
            isChangeAssumed = true;
          }
        }
      } else if (currentValue !== originalValue) {
        isChangeAssumed = true;
      }

      if(originalValue === _UNSET) {
        this._trackedRelations[key] = currentValue;
        return;
      }

      if(!isChangeAssumed && canDeepTrackProperty && currentValue && relationship.hasAnyRelationshipData) {
        let record = this.store.peekRecord(reference.type, currentValue);
        isChangeAssumed = record.get('isDirty');
      }

      if(isChangeAssumed) {//currentValue === originalValue) {
        this.__addOrUpdateChangedRelationKey(key);
      } else {
        this.__removeChangedRelationKey(key);
      }
    },

    __hasManyRelationDidChange(sender, key) {
      key = key.replace('.@each.isDirty', '');
      key = key.replace('.@each', '');
      key = key.replace('.length', '');

      let reference = this.hasMany(key),
        ids = reference.ids(),
        oldIds = this._trackedRelations[key] || [],
        canDeepTrackProperty = this._canDeepTrackProperty("hasMany", key),
        anyIsDirty = false;

      if(canDeepTrackProperty)
      {
        anyIsDirty = this.get(key).
        filter(function(item) {
          return item.get('isDirty');
        }).get('length');
      }

      if(!anyIsDirty && ids.sort().toString() === oldIds.sort().toString()) {
        this.__removeChangedRelationKey(key);
      } else {
        this.__addOrUpdateChangedRelationKey(key);
      }
    },

    __addOrUpdateChangedRelationKey(name) {
      let changedRelationKeys = this.get('changedRelationKeys');
      if(changedRelationKeys.indexOf(name) > -1) return;
      changedRelationKeys.pushObject(name);
    },

    __removeChangedRelationKey(name) {
      let changedRelationKeys = this.get('changedRelationKeys');
      if(changedRelationKeys.indexOf(name) === -1) return;
      changedRelationKeys.removeObject(name);
    },

    /*****************************/

    _canTrackProperty(kind, name) {
      /*
      attributes: true, //true, false, []
      belongsTo: true, //true, false, []
      hasMany: false, //true, false, []
      deep: [], //[]
      exclude: [] //[]
      * */

      let source = [];
      switch(kind) {
        case "attributes":
          source = this.get('internalChangeTrackingOptions.attributes');
          break;
        case "belongsTo":
          source = this.get('internalChangeTrackingOptions.belongsTo');
          break;
        case "hasMany":
          source = this.get('internalChangeTrackingOptions.hasMany');
          break;
        default:
          Ember.Logger.warn(`Invalid tracking kind "${source}"`);
          break;
      }

      let trackMe = false;

      if(source === true || source === false) {
        trackMe = source;
      } else if(Array.isArray(source)) {
        trackMe = source.indexOf(name) >= 0;
      }

      if(Array.isArray(this.get('internalChangeTrackingOptions.exclude')) && this.get('internalChangeTrackingOptions.exclude').indexOf(name) >= 0) {
        trackMe = false;
      }

      return trackMe;
    },

    _canDeepTrackProperty(kind, name) {
      if(!this._canTrackProperty(kind, name))
        return false;

      return Array.isArray(this.get('internalChangeTrackingOptions.deep')) && this.get('internalChangeTrackingOptions.deep').indexOf(name) >= 0;
    },

    /**
     * Returns an object with only that values that have been changed
     * @returns {Object}
     */
    getChanges() {
      let self = this,
        changedKeys = this.changedKeys,
        changeSet = {};
      changedKeys.forEach(function(key) {
        if(self._trackedAttributes[key] !== undefined) {
          changeSet[key] = self._trackedAttributes[key];
        } else if(self._trackedRelations[key] !== undefined) {
          changeSet[key] = self._trackedRelations[key];
        }
      });
      return changeSet;
    },

    reset() {
      //Reset attributes
      this._trackedAttributes = {};
      this.set('changedAttributeKeys', A());
      this._scanAttributes();

      //Reset relations
      this._resetRelations();
      this._trackedRelations = {};
      this.set('changedRelationKeys', A());
      this._scanRelations();
    },

    rollback() {
      this._isRollingBack = true;

      if(this.get('isNew')) {
        this.reset();
      } else {
        this._rollbackAttributes();
        this._rollbackRelations();
      }

      //basic support for ember attribute handling
      //this.rollbackAttributes();
      this.reset();

      //Ember rollback
      this.rollbackAttributes();

      this._isRollingBack = false;
    },

    ready() {
      //console.log("ready: " + this.constructor.modelName + " " + this.get('id'));
      this.reset();
      this._super(...arguments);
    },

    didCreate() {
      //console.log("didCreate: " + this.constructor.modelName + " " + this.get('id'));
      this.reset();
      this._super(...arguments);
    },

    didUpdate() {
      this.reset();
      this._super(...arguments);
    },

    didLoad() {
      //console.log("didLoad: " + this.constructor.modelName + " " + this.get('id'));
      this.reset();
      this._super(...arguments);
    },

    didDelete() {
      //console.log("didDelete: " + this.constructor.modelName + " " + this.get('id'));
      this.rollbackAttributes();

      this._trackedAttributes = {};
      this._trackedRelations = {};

      this.set('changedAttributeKeys', A());
      this.set('changedRelationKeys', A());

      this._super(...arguments);
    },

    init:function() {
      //console.log("init: " + this.constructor.modelName + " " + this.get('id'));
      this._trackedAttributes = {};
      this._trackedRelations = {};

      this._super(...arguments);
    }
  });
}

export default {
  name: 'change-tracking',
  initialize
};
