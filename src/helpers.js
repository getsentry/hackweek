import {buildChildList, dataToJS, orderedToJS} from 'react-redux-firebase';
import {
  set,
  get,
  has,
  last,
  split,
  map,
  mapValues,
  every,
  reduce,
  isArray,
  isObject,
  isString,
  isFunction,
  defaultsDeep,
} from 'lodash';

export const getPopulateObj = str => {
  if (!isString(str)) {
    return str;
  }
  const strArray = str.split(':');
  // TODO: Handle childParam
  return {child: strArray[0], root: strArray[1]};
};

export const getPopulateObjs = arr => {
  if (!isArray(arr)) {
    return arr;
  }
  return arr.map(o => (isObject(o) ? o : getPopulateObj(o)));
};

/**
 * The way react-redux-firebase handles ordering is through a special orderedDataToJS
 * method. It tries to overload these methods given it uses the same helpers to manage
 * a list of objects as well as a single object.
 *
 * Unfortunately, there is no exposed API to grab an ordered result which **also**
 * populates children, so we've effectively copy pasted that entire code and created
 * this helper function.
 *
 * @param {*} data
 * @param {*} path
 * @param {*} populates
 * @param {*} notSetValue
 */
export const orderedPopulatedDataToJS = (data, path, populates, notSetValue) => {
  if (!data) {
    return notSetValue;
  }
  // Handle undefined child
  if (!orderedToJS(data, path, notSetValue)) {
    return orderedToJS(data, path, notSetValue);
  }

  // test if data is a single object vs a list of objects, try generating
  // populates and testing for key presence
  const populatesForData = getPopulateObjs(
    isFunction(populates)
      ? populates(last(split(path, '/')), dataToJS(data, path))
      : populates
  );
  const dataHasPopluateChilds = every(populatesForData, populate =>
    has(dataToJS(data, path), populate.child)
  );

  if (dataHasPopluateChilds) {
    // Data is a single object, resolve populates directly
    return reduce(
      map(populatesForData, (p, obj) => {
        // populate child is key
        if (isString(get(dataToJS(data, path), p.child))) {
          const key = get(dataToJS(data, path), p.child);
          const pathString = p.childParam
            ? `${p.root}/${key}/${p.childParam}`
            : `${p.root}/${key}`;
          if (dataToJS(data, pathString)) {
            return set(
              {},
              p.child,
              p.keyProp
                ? {[p.keyProp]: key, ...dataToJS(data, pathString)}
                : dataToJS(data, pathString)
            );
          }

          // matching child does not exist
          return dataToJS(data, path);
        }
        return set(
          {},
          p.child,
          buildChildList(data, get(dataToJS(data, path), p.child), p)
        );
      }),
      // combine data from all populates to one object starting with original data
      (obj, v) => defaultsDeep(v, obj),
      dataToJS(data, path)
    );
  } else {
    // Data is a map of objects, each value has parameters to be populated
    return mapValues(orderedToJS(data, path), (child, childKey) => {
      const populatesForDataItem = getPopulateObjs(
        isFunction(populates) ? populates(childKey, child) : populates
      );
      const resolvedPopulates = map(populatesForDataItem, (p, obj) => {
        // no matching child parameter
        if (!child || !get(child, p.child)) {
          return child;
        }
        // populate child is key
        if (isString(get(child, p.child))) {
          const key = get(child, p.child);
          const pathString = p.childParam
            ? `${p.root}/${key}/${p.childParam}`
            : `${p.root}/${key}`;
          if (dataToJS(data, pathString)) {
            return set(
              {},
              p.child,
              p.keyProp
                ? {[p.keyProp]: key, ...dataToJS(data, pathString)}
                : dataToJS(data, pathString)
            );
          }
          // matching child does not exist
          return child;
        }
        // populate child list
        return set({}, p.child, buildChildList(data, get(child, p.child), p));
      });

      // combine data from all populates to one object starting with original data
      return reduce(resolvedPopulates, (obj, v) => defaultsDeep(v, obj), child);
    });
  }
};

export const mapObject = (obj, callback) => {
  let results = [];
  let key;
  for (key in obj) {
    results.push(callback ? callback(obj[key], key) : obj[key]);
  }
  return results;
};
