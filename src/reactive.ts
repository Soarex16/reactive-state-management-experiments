class GetterContextHolder {
  public static current: string | undefined = undefined;
}

const computedCacheSymbol = Symbol("computed-cache");

interface CacheEntry {
  dependentProps: Set<string>;
  val: any;
}

// В идеале кеш должен представлять из себя граф зависимостей
type ComputedCache = Map<string, CacheEntry>;

/**
 * Copy property from source into target and make it reactive
 */
function copyObservableProperty(source: any, target: any, property: string) {
  if (!(property in source)) {
    throw new Error(`Property ${property} does not exists in object!`);
  }

  Object.defineProperty(target, property, {
    get() {
      const cache: ComputedCache = target[computedCacheSymbol];

      if (!cache) {
        console.warn("Target object don't have a cache");
      } else {
        // Если сейчас происходит вычисление выражения внутри getter-а,
        // то добавляем свойство в массив зависимостей
        if (GetterContextHolder.current) {
          const getterCacheEntry = cache.get(GetterContextHolder.current);
          if (getterCacheEntry) {
            getterCacheEntry.dependentProps.add(property);
          } else {
            cache.set(GetterContextHolder.current, {
              dependentProps: new Set(property),
              val: undefined
            });
          }
        }
      }

      console.log(`Current context: ${GetterContextHolder.current}`);
      console.log(`acces to ${property}`);
      return source[property];
    },
    set(value) {
      const cache: ComputedCache = target[computedCacheSymbol];

      // Если свойство изменилось, необходимо
      // пройтись по всему кешу и сбросить значения
      if (!cache) {
        console.warn("Target object don't have a cache");
      } else {
        cache.forEach((cacheEntry, key) => {
          if (cacheEntry.dependentProps.has(property)) {
            cacheEntry.val = undefined;
            console.log(`Purging cache for ${key}`);
          }
        });
      }

      console.log(`changed ${property}`);
      source[property] = value;
    }
  });
}

function reactive<T>(obj: T): T {
  // copy original object
  const objectCopy = Object.assign({}, obj);
  const observableWrapper = {};

  observableWrapper[computedCacheSymbol] = new Map<Function, CacheEntry>();

  const objDescriptors = Object.getOwnPropertyDescriptors(obj);
  Object.keys(objDescriptors).forEach((prop) => {
    copyObservableProperty(objectCopy, observableWrapper, prop);
  });

  const originalProto = Object.getPrototypeOf(obj);
  const protoDescriptors = Object.getOwnPropertyDescriptors(originalProto);
  const observableProto = {};

  // @ts-ignore
  observableWrapper.__proto__ = observableProto;
  Object.entries(protoDescriptors).forEach(([prop, descriptor]) => {
    if (descriptor.get) {
      const originalGetter = descriptor.get;
      descriptor.get = function proxifiedGetter() {
        const cache: ComputedCache = observableWrapper[computedCacheSymbol];
        // Если есть в кеше, то достаем оттуда
        const cachedVal = cache.get(prop);
        if (cachedVal && cachedVal.val) {
          console.log(`Cached access to ${prop}`);
          return cachedVal.val;
        } else {
          GetterContextHolder.current = prop;
          const computedVal = originalGetter.bind(observableWrapper)();
          const updatedCacheValue = cache.get(prop);
          if (updatedCacheValue) {
            updatedCacheValue.val = computedVal;
          }
          GetterContextHolder.current = undefined;

          return computedVal;
        }
      };
    }
    Object.defineProperty(observableProto, prop, descriptor);
  });

  return observableWrapper as T;
}

export default reactive;
