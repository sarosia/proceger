var Process = require("../lib/process");
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

describe("Testing Process class", function () {
    this.timeout(5000);

    it("echo hello", function () {
        var process = new Process({
            command: "echo",
            args: [ "hello" ]
        });
        return expect(process.start()).to.eventually.equals(0);
    });

    it("large output", function () {
        var process = new Process({
            command: "head",
            args: [ "-c", "2048000", "/dev/zero" ]
        });

        return expect(process.start().then(function () {
            return process.getStdout().length;
        })).to.eventually.equals(1024 * 1024);
    });
});

