import Util from '../Util';

it('sanitizes file name', () => {
  expect(Util.sanitizeS3FileName('I\'m a dirty %&&^%# filename')).toEqual('I\'m-a-dirty--------filename');
});
