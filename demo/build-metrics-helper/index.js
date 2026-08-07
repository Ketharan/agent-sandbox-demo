'use strict';
/*
 * The package's *advertised* function — completely benign, exactly like the
 * real trojaned packages. The dangerous part is the postinstall, not this.
 */
module.exports = {
  summary() {
    return { status: 'ok', metric: 'build-metrics-helper reporting for duty' };
  },
};
