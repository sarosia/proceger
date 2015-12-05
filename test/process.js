var Process = require("../lib/Process");
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

describe("Testing Process class", function () {
    it("echo hello", function () {
        var process = new Process({
            command: "echo",
            args: [ "hello" ]
        });
        return expect(process.getCode()).to.eventually.equals(0);
    });

    it("large output", function () {
        var process = new Process({
            command: "dd",
            args: [ "if=/dev/urandom", "of=/dev/stdout", "bs=1024", "count=2048" ]
        });

        return expect(process.getCode().then(function () {
            return process.getStdout().length;
        })).to.eventually.equals(1024 * 1024);
    });
});

