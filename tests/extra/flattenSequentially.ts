/// <reference types="mocha"/>
/// <reference types="node" />
import xs from '../../src/index';
import flattenSequentially from '../../src/extra/flattenSequentially';
import * as assert from 'assert';

describe('flattenSequentially (extra)', () => {
  describe('with map', () => {
    it('should expand each periodic event with 3 sync events', (done: any) => {
      const stream = xs.periodic(100).take(3)
        .map(i => xs.of(1 + i, 2 + i, 3 + i))
        .compose(flattenSequentially);
      const expected = [1, 2, 3, 2, 3, 4, 3, 4, 5];
      const listener = {
        next: (x: number) => {
          assert.equal(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.equal(expected.length, 0);
          done();
        },
      };
      stream.addListener(listener);
    });

    it('should expand each sync event as a periodic stream and concatenate', (done: any) => {
      const stream = xs.of(1, 2, 3)
        .map(i => xs.periodic(100).take(3).map(x => `${i}${x}`))
        .compose(flattenSequentially);
      const expected = ['10', '11', '12', '20', '21', '22', '30', '31', '32'];
      const listener = {
        next: (x: string) => {
          assert.equal(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.equal(expected.length, 0);
          done();
        },
      };
      stream.addListener(listener);
    });

    it('should expand 3 sync events as a periodic each', (done: any) => {
      const stream = xs.of(1, 2, 3)
        .map(i => xs.periodic(100 * i).take(2).map(x => `${i}${x}`))
        .compose(flattenSequentially);
      // ---x---x---x---x---x---x
      // ---10--11
      //         -------20------21
      //                         -----------30----------31
      const expected = ['10', '11', '20', '21', '30', '31'];
      const listener = {
        next: (x: string) => {
          assert.equal(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.equal(expected.length, 0);
          done();
        },
      };
      stream.addListener(listener);
    });

    it('should expand 3 async events as a periodic each', (done: any) => {
      const stream = xs.periodic(140).take(3)
        .map(i =>
          xs.periodic(100 * (i < 2 ? 1 : i)).take(3).map(x => `${i}${x}`)
        )
        .compose(flattenSequentially);
      // ---x---x---x---x---x---x---x---x---x---x---x---x
      // ---00--01--02
      //             ----10--11--12
      //                          ------------20-----------21----------22
      const expected = ['00', '01', '02', '10', '11', '12', '20', '21', '22'];
      stream.addListener({
        next: (x: string) => {
          assert.equal(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.equal(expected.length, 0);
          done();
        },
      });
    });

    it('should expand 3 async events as a periodic each, no optimization', (done: any) => {
      const stream = xs.periodic(140).take(3)
        .map(i =>
          xs.periodic(100 * (i < 2 ? 1 : i)).take(3).map(x => `${i}${x}`)
        )
        .filter(() => true) // breaks an optimization map+flattenSequentially
        .compose(flattenSequentially);
      // ---x---x---x---x---x---x---x---x---x---x---x---x
      // ---00--01--02
      //             ----10--11--12
      //                          ------------20-----------21----------22

      const expected = ['00', '01', '02', '10', '11', '12', '20', '21', '22'];
      const listener = {
        next: (x: string) => {
          assert.equal(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.equal(expected.length, 0);
          done();
        }
      };
      stream.addListener(listener);
    });

    it('should propagate user mistakes in project as errors', (done: any) => {
      const source = xs.periodic(30).take(1);
      const stream = source.map(
        x => {
          const y = (<string> <any> x).toLowerCase();
          return xs.of(y);
        }
      ).compose(flattenSequentially);

      stream.addListener({
        next: () => done('next should not be called'),
        error: (err) => {
          assert.notStrictEqual(err.message.match(/is not a function$/), null);
          done();
        },
        complete: () => {
          done('complete should not be called');
        },
      });
    });

    it('should emit data from inner streams after synchronous outer completes', (done: any) => {
      const outer = xs.of(42);
      const stream = outer.map(i => xs.periodic(50).take(2).mapTo(i))
        .compose(flattenSequentially);
      const expected = [42, 42];

      stream.addListener({
        next: (x: number) => {
          assert.strictEqual(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => {
          assert.strictEqual(expected.length, 0);
          done();
        },
      });
    });

    it('should stop inner emissions if result stops', (done: any) => {
      const expectedInner = [0, 1];

      const stream = xs.of(1)
        .map(i =>
          xs.periodic(150).take(3) // 150ms, 300ms, 450ms, 600ms
            .debug(x => assert.strictEqual(x, expectedInner.shift()))
        )
        .compose(flattenSequentially);

      const expected = [0, 1];
      const listener = {
        next: (x: number) => {
          assert.strictEqual(x, expected.shift());
        },
        error: (err: any) => done(err),
        complete: () => done('should not call complete'),
      };

      stream.addListener(listener);
      setTimeout(() => {
        stream.removeListener(listener);
      }, 390);

      setTimeout(() => {
        assert.strictEqual(expectedInner.length, 0);
        assert.strictEqual(expected.length, 0);
        done();
      }, 500);
    });
  });
});
