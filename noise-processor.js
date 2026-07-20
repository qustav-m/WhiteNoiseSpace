class NoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'alpha', defaultValue: 0, minValue: 0, maxValue: 1 }];
  }

  constructor() {
    super();
    this._value = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    const alpha  = parameters['alpha'];
    for (let i = 0; i < output.length; i++) {
      const a = alpha.length > 1 ? alpha[i] : alpha[0];
      if (Math.random() < (1 - a)) this._value = Math.random() * 2 - 1;
      output[i] = this._value;
    }
    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
