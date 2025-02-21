import { expect, test, describe } from 'vitest';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';

import {
  transformStateCreatorArgs,
  getPrefixedObject,
  getUnprefixedObject,
  namespaced,
  createNamespace,
  toNamespace,
  fromNamespace,
  getNamespaceHooks,
} from '../src/utils';
import { StoreApi, StateCreator, create, UseBoundStore } from 'zustand';
import {
  FilterByPrefix,
  Namespace,
  PrefixObject,
  UseBoundNamespace,
} from '../src/types';

type State = {
  user_name: string;
  user_age: number;
  admin_level: number;
};

type UserNamespace = Namespace<FilterByPrefix<'user', State>, 'user'>;

type AdminNamespace = Namespace<FilterByPrefix<'admin', State>, 'admin'>;

describe('transformStateCreatorArgs', () => {
  test('should transform state creator arguments', () => {
    const mockNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const originalArgs: Parameters<StateCreator<State>> = [
      () => {},
      () => ({} as State),
      {} as StoreApi<State>,
    ];

    const transformedArgs = transformStateCreatorArgs(
      mockNamespace,
      ...originalArgs
    );

    expect(transformedArgs).toBeDefined();
    expectType<
      TypeEqual<
        typeof transformedArgs,
        Parameters<typeof mockNamespace.creator>
      >
    >(true);
  });
});

describe('getPrefixedObject', () => {
  test('should prefix object keys', () => {
    const obj = { name: 'Alice', age: 25 };
    const prefixedObj = getPrefixedObject('user', obj);

    expect(prefixedObj).toEqual({
      user_name: 'Alice',
      user_age: 25,
    });

    expectType<TypeEqual<typeof prefixedObj, PrefixObject<'user', typeof obj>>>(
      true
    );
  });
});

describe('getUnprefixedObject', () => {
  test('should remove prefix from object keys', () => {
    const obj = { user_name: 'Alice', user_age: 25 };
    const unprefixedObj = getUnprefixedObject('user', obj);

    expect(unprefixedObj).toEqual({
      name: 'Alice',
      age: 25,
    });

    expectType<
      TypeEqual<typeof unprefixedObj, FilterByPrefix<'user', typeof obj>>
    >(true);
  });
});

describe('divide', () => {
  test('should create a state creator with namespaces', () => {
    const userNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const adminNamespace: AdminNamespace = {
      name: 'admin',
      creator: () => ({
        level: 1,
      }),
    };

    const combinedCreator = create(
      namespaced({ namespaces: [userNamespace, adminNamespace] })
    );

    expectType<
      StateCreator<
        FilterByPrefix<'user', State> & FilterByPrefix<'admin', State>
      >
    >(combinedCreator);
  });

  test('the set method inside divide s hould be of type SetState', () => {
    const userNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const adminNamespace: AdminNamespace = {
      name: 'admin',
      creator: () => ({
        level: 1,
      }),
    };

    create(
      namespaced(
        (state) => (set) => {
          expectType<StoreApi<State>['setState']>(set);
          return state;
        },
        { namespaces: [userNamespace, adminNamespace] }
      )
    );
  });

  test('should infer the divide type', () => {
    const userNamespace = createNamespace('user', () => ({
      name: 'Alice',
      age: 25,
    }));

    const adminNamespace = createNamespace('admin', () => ({
      level: 1,
    }));

    const useStore = create(
      namespaced({ namespaces: [userNamespace, adminNamespace] })
    );

    expectType<UseBoundStore<StoreApi<State>>>(useStore);
  });
});

describe('namespaceHook', () => {
  test('should create a namespace hook', () => {
    const userNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const useStore = create<State>()(
      namespaced(
        (state) => () => ({
          admin_level: 1,
          ...state,
        }),
        { namespaces: [userNamespace] }
      )
    );

    const { user: hook } = getNamespaceHooks(useStore, userNamespace);

    expect(hook).toBeDefined();
    expectType<UseBoundNamespace<StoreApi<FilterByPrefix<'user', State>>, any>>(
      hook
    );
  });
});

describe('namespaceHooks', () => {
  test('should create multiple namespace hooks', () => {
    const userNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const adminNamespace: AdminNamespace = {
      name: 'admin',
      creator: () => ({
        level: 1,
      }),
    };

    const useStore = create<State>()(
      namespaced(
        (state) => () => ({
          ...state,
        }),
        { namespaces: [userNamespace, adminNamespace] }
      )
    );

    const { user: useUser, admin: useAdmin } = getNamespaceHooks(
      useStore,
      userNamespace,
      adminNamespace
    );

    expect(useUser).toBeDefined();
    expect(useAdmin).toBeDefined();

    expectType<UseBoundNamespace<StoreApi<FilterByPrefix<'user', State>>, any>>(
      useUser
    );
    expectType<
      UseBoundNamespace<StoreApi<FilterByPrefix<'admin', State>>, any>
    >(useAdmin);
  });
});

describe('stateToNamespace', () => {
  test('should extract namespace from state', () => {
    const userNamespace: UserNamespace = {
      name: 'user',
      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const state: State = {
      user_name: 'Alice',
      user_age: 25,
      admin_level: 1,
    };

    const namespace = toNamespace(state, userNamespace);

    expect(namespace).toEqual({
      name: 'Alice',
      age: 25,
    });

    expectType<FilterByPrefix<'user', State>>(namespace);
  });
});

describe('namespaceToState', () => {
  test('should add prefix to namespace state', () => {
    const subNamespace: AdminNamespace = {
      name: 'admin',
      creator: () => ({
        level: 1,
      }),
    };
    const userNamespace: UserNamespace = {
      name: 'user',

      creator: () => ({
        name: 'Alice',
        age: 25,
      }),
    };

    const state = { name: 'Alice', age: 25 };

    const namespacedState = fromNamespace(state, userNamespace);

    expect(namespacedState).toEqual({
      user_name: 'Alice',
      user_age: 25,
    });

    const deepNamespacedState = fromNamespace(
      state,
      subNamespace,
      userNamespace
    );

    expect(deepNamespacedState).toEqual({
      user_admin_name: 'Alice',
      user_admin_age: 25,
    });

    expectType<PrefixObject<'user', typeof state>>(namespacedState);
  });
});

describe('createNamespace', () => {
  test('should create a namespace definition', () => {
    const testNamespace = createNamespace<{ key: string }>()('test', () => ({
      key: 'value',
    }));

    expect(testNamespace).toBeDefined();
    expect(testNamespace.name).toBe('test');
    expect(testNamespace.creator).toBeDefined();
  });

  test('should create have typed raw state', () => {
    const subNamespace = createNamespace('subNamespace', () => ({
      key: 'value',
    }));
    const namespace = createNamespace(
      'namespace',
      namespaced((state) => () => ({ key: 'value', ...state }), {
        namespaces: [subNamespace],
      })
    );

    const useStore = create(
      namespaced(
        (state) => () => ({
          key: 'value',
          ...state,
        }),
        { namespaces: [namespace] }
      )
    );

    const { namespace: useNamespaceStore } = getNamespaceHooks(
      useStore,
      namespace
    );
    const { subNamespace: useSubNamespaceStore } = getNamespaceHooks(
      useNamespaceStore,
      subNamespace
    );
    expectType<string>(useNamespaceStore.getRawState().namespace_key);
    expectType<string>(
      useNamespaceStore.getRawState().namespace_subNamespace_key
    );
    expectType<string>(
      useSubNamespaceStore.getRawState().namespace_subNamespace_key
    );
  });
});
