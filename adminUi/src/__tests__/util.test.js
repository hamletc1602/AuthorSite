import Util from '../Util';

const config1 = {
  content: {
    prop1: [{
        name: 'name3_0',
        prop3: 'value3_0'
      },{
        name: 'name3_1',
        prop3: 'value3_1'
      }],
    prop2: 'value2'
  },
  schema: {
    type: 'object',
    prop1: {
      type: 'list',
      elemType: 'object',
      prop3: {
        type: 'string'
      }
    },
    prop2: {
      type: 'string'
    }
  }
}

const config2 = {
  content: [{
      name: 'name1_0',
      prop1: 'value1_0'
    },{
      name: 'name1_1',
      prop1: 'value1_1'
    }],
  schema: {
    type: 'list',
    elemType: 'object',
    properties: {
      prop1: {
        type: 'string'
      }
    }
  }
}

const configs = {
  current: {
    config1: config1,
    config2: config2
  }
}

const prop3_1_path = [{ name: 'config1'}, {name: 'prop1'}, {index: 1, name: 'name3_1'}, {name: 'prop3'}]
const prop1_path = [{ name: 'config1'}, {name: 'prop1'}]
const conf2_elem0_path = [{ name: 'config2'}, {index: 0, name: 'name1_0'}]

it('sanitizes file name', () => {
  expect(Util.sanitizeS3FileName('I\'m a dirty %&&^%# filename')).toEqual('I\'m-a-dirty--------filename')
});

it('get from config by path', () => {
  expect(Util.getContentForPath(configs, prop3_1_path)).toEqual('value3_1')
  expect(Util.getContentForPath(configs, prop1_path)).toEqual(config1.content.prop1)
  expect(Util.getContentForPath(configs, conf2_elem0_path)).toEqual(config2.content[0])
});

it('Get schema by path', () => {
  expect(Util.getSchemaForPath(configs, prop3_1_path)).toEqual({type: 'string'})
  expect(Util.getSchemaForPath(configs, prop1_path)).toEqual(config1.schema.prop1)
  expect(Util.getSchemaForPath(configs, conf2_elem0_path)).toEqual(config2.schema)
});
