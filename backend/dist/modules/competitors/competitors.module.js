"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetitorsModule = void 0;
const common_1 = require("@nestjs/common");
const competitors_controller_1 = require("./competitors.controller");
const competitors_service_1 = require("./competitors.service");
let CompetitorsModule = class CompetitorsModule {
};
exports.CompetitorsModule = CompetitorsModule;
exports.CompetitorsModule = CompetitorsModule = __decorate([
    (0, common_1.Module)({
        controllers: [competitors_controller_1.CompetitorsController],
        providers: [competitors_service_1.CompetitorsService],
        exports: [competitors_service_1.CompetitorsService],
    })
], CompetitorsModule);
//# sourceMappingURL=competitors.module.js.map