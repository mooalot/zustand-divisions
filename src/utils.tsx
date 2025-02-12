import {
  StateCreator,
  StoreApi,
  StoreMutatorIdentifier,
  useStore,
} from 'zustand';
import { shallow } from 'zustand/shallow';
import {
  ExcludeByPrefix,
  ExtractNamespaces,
  FilterByPrefix,
  IncludeByPrefix,
  Namespace,
  PrefixObject,
  UseBoundNamespace,
  WithNamespace,
} from './types';

function getNamespacedApi<T extends object, Name extends string>(
  namespace: Namespace<FilterByPrefix<Name, T>, Name>,
  api: StoreApi<T>
): WithNamespace<StoreApi<FilterByPrefix<Name, T>>> {
  const namespacedApi: StoreApi<FilterByPrefix<Name, T>> = {
    getInitialState: () => {
      return getUnprefixedObject(namespace.name, api.getInitialState());
    },
    getState: () => {
      return getUnprefixedObject(namespace.name, api.getState());
    },
    setState: (state, replace) => {
      api.setState((currentState) => {
        const unprefixedState = getUnprefixedObject(
          namespace.name,
          currentState
        );
        const updatedState =
          typeof state === 'function' ? state(unprefixedState) : state;
        if (replace) {
          const prefixedState = getPrefixedObject(
            namespace.name,
            unprefixedState
          );
          const newState = { ...currentState };
          for (const key in prefixedState) {
            delete newState[key];
          }
          return {
            ...newState,
            ...getPrefixedObject(namespace.name, updatedState),
          };
        }
        return getPrefixedObject(namespace.name, updatedState) as T;
      });
    },
    subscribe: (listener) => {
      return api.subscribe((newState, oldState) => {
        const newUnprefixedState = getUnprefixedObject(
          namespace.name,
          newState
        );
        const oldUnprefixedState = getUnprefixedObject(
          namespace.name,
          oldState
        );
        if (shallow(newUnprefixedState, oldUnprefixedState)) return;
        listener(
          getUnprefixedObject(namespace.name, newState),
          getUnprefixedObject(namespace.name, oldState)
        );
      });
    },
  };

  return withFactories(namespacedApi);
}

function withFactories<T extends object>(
  api: StoreApi<T>
): WithNamespace<StoreApi<T>> {
  return Object.assign(api, {
    getNamespaceHook: (...namespaces: Namespace[]) => {
      if (namespaces.length === 1) {
        return getNamespaceHook(api, namespaces[0]);
      } else {
        return namespaces.map((namespace) => getNamespaceHook(api, namespace));
      }
    },
  } as WithNamespace<StoreApi<T>>);
}

export function transformStateCreatorArgs<
  N extends string,
  State extends object
>(
  namespace: Namespace<FilterByPrefix<N, State>, N>,
  ...args: Parameters<StateCreator<State>>
): Parameters<StateCreator<FilterByPrefix<N, State>>> {
  const [, , originalApi] = args;

  const newApi = getNamespacedApi(namespace, originalApi);

  return [newApi.setState, newApi.getState, newApi];
}

export function getPrefixedObject<T extends string, O extends object>(
  typePrefix: T,
  obj: O
) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    return {
      ...acc,
      [`${typePrefix}_${key}`]: value,
    };
  }, {} as PrefixObject<T, O>);
}

export function getUnprefixedObject<T extends string, Data extends object>(
  typePrefix: T,
  obj: Data
) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (key.startsWith(`${typePrefix}_`)) {
      return {
        ...acc,
        [key.slice(typePrefix.length + 1)]: value,
      };
    }
    return acc;
  }, {} as FilterByPrefix<T, Data>);
}

/**
 * Method used to spread namespace data into a parent state.
 * @param namespaces The namespaces
 * @param callback A callback that returns the namespace data
 * @returns The combined namespace data
 */
export function spreadNamespaces<Namespaces extends readonly Namespace[], Data>(
  namespaces: Namespaces,
  callback: (namespace: Namespaces[number]) => Data
) {
  return namespaces.reduce((acc, namespace) => {
    return {
      ...acc,
      ...callback(namespace),
    };
  }, {} as Data);
}

function transformCallback<State extends object>(
  ...args: Parameters<StateCreator<State>>
) {
  return function <P extends string>(
    namespace: Namespace<FilterByPrefix<P, State>, P>
  ) {
    const newArgs = transformStateCreatorArgs(namespace, ...args);
    return getPrefixedObject(namespace.name, namespace.creator(...newArgs));
  };
}

function spreadTransformedNamespaces<
  State extends object,
  Namespaces extends readonly Namespace[]
>(
  namespaces: Namespaces,
  ...args: Parameters<StateCreator<State>>
): IncludeByPrefix<Namespaces[number]['name'], State> {
  // eslint-disable-next-line
  return spreadNamespaces(namespaces, transformCallback(...args)) as any;
}

function getNamespaceHook<Name extends string, Store extends object>(
  api: StoreApi<Store>,
  namespace: Namespace<FilterByPrefix<Name, Store>, Name>
) {
  type BoundStore = UseBoundNamespace<StoreApi<FilterByPrefix<Name, Store>>>;
  const namespaceApi = getNamespacedApi(namespace, api);
  const hook = ((selector) => {
    return useStore(namespaceApi, selector);
  }) as BoundStore;

  return Object.assign(hook, namespaceApi);
}

/**
 * Helper method for going from a state to a namespace.
 * @param namespace A namespace
 * @param state The state of the store
 * @returns The namespace state
 */
export function toNamespace<State extends object, N extends string>(
  namespace: Pick<Namespace<FilterByPrefix<N, State>, N>, 'name'>,
  state: State
) {
  return getUnprefixedObject(namespace.name, state);
}

/**
 * Helper method for going to a state from a namespace.
 * @param namespace A namespace
 * @param state The state of the store
 * @returns The namespace state
 */
export function fromNamespace<State extends object, P extends string>(
  namespace: Pick<Namespace<FilterByPrefix<P, State>, P>, 'name'>,
  state: State
) {
  return getPrefixedObject(namespace.name, state);
}

type CreateNamespace = {
  <Name extends string, Data, Options>(
    callback: () => Namespace<Data, Name, Options>
  ): Namespace<Data, Name, Options>;
  <T, Options = unknown>(): <Name extends string>(
    callback: () => Namespace<T, Name, Options>
  ) => Namespace<T, Name, Options>;
};

/**
 * Helper method for creating a namespace.
 * @param callback A callback that returns a namespace
 * @returns A function that returns a namespace
 */
// eslint-disable-next-line
export const createNamespace: CreateNamespace = ((callback?: any) => {
  if (callback) {
    // The first overload implementation
    return callback();
  } else {
    // The second overload implementation
    return <Prefix extends string, Data, Options>(
      callback: () => Namespace<Data, Prefix, Options>
    ) => {
      return callback();
    };
  }
}) as CreateNamespace;

/**
 * Helper method for partializing a namespace. This method is often used in 3rd party libraries to create a partialized version of a store.
 * @param state The state of the store
 * @param getPartializeFn A function that returns a partialized version of the namespace
 * @returns A function that returns a partialized version of the namespace
 */
export function partializeNamespace<
  P extends string,
  State extends object,
  Options
>(
  state: State,
  getPartializeFn: (
    namespace: Namespace<FilterByPrefix<P, State>, P, Options>
  ) =>
    | ((state: FilterByPrefix<P, State>) => Partial<FilterByPrefix<P, State>>)
    | undefined
) {
  return (namespace: Namespace<FilterByPrefix<P, State>, P, Options>) => {
    const namespaceData = toNamespace(namespace, state);
    const partializedData = getPartializeFn(namespace)?.(namespaceData);
    return fromNamespace(namespace, partializedData ?? {});
  };
}

/**
 * Helper method for partializing a namespace. This method is often used in 3rd party libraries to create a partialized version of a store.
 * @param state The state of the store
 * @param namespaces The namespaces of the store
 * @param getPartializeFn A function that returns a partialized version of the namespace
 * @returns A function that returns a partialized version of the namespace
 */
export function partializeNamespaces<
  State extends object,
  Namespaces extends readonly Namespace[],
  Fn extends <D extends Namespaces[number]>(
    namespace: D
  ) => // eslint-disable-next-line
  ((state: any) => any) | undefined
>(state: State, namespaces: Namespaces, getPartializeFn: Fn) {
  return spreadNamespaces(
    namespaces,
    partializeNamespace(state, getPartializeFn)
  );
}

declare module 'zustand/vanilla' {
  // eslint-disable-next-line
  interface StoreMutators<S, A> {
    'zustand-namespaces': WithNamespace<S>;
  }
}

export function namespaced<Namespaces extends readonly Namespace[]>(
  ...namespaces: Namespaces
): <
  T,
  Excluded extends ExcludeByPrefix<Namespaces[number]['name'], T>,
  Result extends Excluded & ExtractNamespaces<Namespaces>,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  creator?: StateCreator<
    Result,
    [...Mps, ['zustand-namespaces', unknown]],
    Mcs,
    Excluded
  >
) => StateCreator<
  Result,
  Mps,
  [['zustand-namespaces', Namespaces], ...Mcs],
  Result
> {
  // @ts-expect-error  // eslint-disable-next-line
  return (creator) => {
    return (...args) => {
      const [set, get, api] = args;

      const apiWithNamespace = withFactories(api);

      return {
        ...spreadTransformedNamespaces(namespaces, set, get, apiWithNamespace),
        // @ts-expect-error // eslint-disable-next-line
        ...creator?.(set, get, apiWithNamespace),
      };
    };
  };
}
